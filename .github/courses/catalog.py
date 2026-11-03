"""Каталог курсов по ИИ для binap.ru/kursy-ii/ из фидов и API AdvCake.

Правила разбора фидов, отбора ИИ-курсов и подтяжки реквизитов рекламодателей перенесены
из edu.workle.ru (site/lib.php: parse_feed, is_ai_course, run_update). Сайт статичный, поэтому
вместо PHP на хостинге раз в сутки работает GitHub Actions (.github/workflows/courses.yml в репозитории сайта).

Запуск:
  ADVCAKE_KEY=… python3 catalog.py update <папка сайта>   — скачать фиды, обновить data/courses.json и страницу
  python3 catalog.py render <папка сайта>                  — только пересобрать страницу из data/courses.json

Показываем только курсы, у которых есть erid и реквизиты рекламодателя: без них реклама не размечена.
Персональные данные не обрабатываются: сервер обращается только к AdvCake.
"""
import datetime, html, json, math, os, pathlib, re, sys, urllib.parse, urllib.request
import xml.etree.ElementTree as ET

API_BASES = ["https://api.advcake.com", "https://api.advcake.ru"]
MAX_FEED = 60 * 1024 * 1024
UA = "binap.ru catalog updater"
MSK = datetime.timezone(datetime.timedelta(hours=3))
SCHOOL_NAMES = {"coddyschool": "Coddy", "eduson.academy": "Eduson Academy", "easycode.tech": "Easycode", "gb.ru": "GeekBrains",
                "practicum.yandex": "Яндекс Практикум", "skillbox": "Skillbox", "нетология": "Нетология", "skysmart": "Skysmart",
                "synergyacademy": "Synergy Academy", "slurm.io": "Слёрм", "algoritmika.org": "Алгоритмика",
                "karpov.courses": "karpov.courses", "maed.ru": "MAED", "online.videoforme.ru": "Международная школа профессий"}
NBSP = " "


# ---------- разбор фида (как parse_feed в lib.php) ----------
def num(v):
    v = str(v or "").replace(" ", "").replace(NBSP, "").replace(",", ".").strip()
    try:
        return float(v)
    except ValueError:
        return None


def money(n):
    s = f"{n:,.0f}" if n == int(n) else f"{n:,.2f}"
    return s.replace(",", NBSP).replace(".", ",") + " ₽"


def plural(n, one, few, many):
    n = abs(int(n)) % 100
    m = n % 10
    if 10 < n < 20:
        return many
    if 1 < m < 5:
        return few
    return one if m == 1 else many


def fmt_duration(v, unit):
    v = str(v or "").strip()
    if not v:
        return ""
    if not re.fullmatch(r"\d+([.,]\d+)?", v):
        return v
    n = float(v.replace(",", "."))
    if n <= 0:
        return ""
    words = {"month": ("месяц", "месяца", "месяцев"), "week": ("неделя", "недели", "недель"), "day": ("день", "дня", "дней"),
             "year": ("год", "года", "лет"), "hour": ("час", "часа", "часов")}
    w = words.get((unit or "").strip().lower() or "month", words["month"])
    if n != int(n):
        return str(n).replace(".", ",") + " " + w[1]
    return f"{int(n)} {plural(n, *w)}"


def clean_category(c):
    return re.sub(r"^Онлайн\s+(Курс|Модульный набор|Открытое занятие)\s+", "", (c or "").strip(), flags=re.I).strip()


AI_KW = re.compile(r"нейро|(?<![^\W\d_])ии(?![^\W\d_])|(?<![a-z])ai(?![a-z])|искусственн|chatgpt|gpt|промпт|prompt|машинн|llm|midjourney|генеративн|copilot|(?<![a-z])ml(?![a-z])", re.I)


def is_ai_course(title, category):
    if (category or "").strip().lower() == "нейросети":
        return True
    return bool(AI_KW.search(title or "")) and not re.search(r"тариф", title or "", re.I)


def url_param(url, name):
    q = urllib.parse.urlparse(url).query
    v = urllib.parse.parse_qs(q).get(name)
    return v[0] if v else ""


def target_host(url):
    t = url_param(url, "dl") or url
    return re.sub(r"^www\.", "", (urllib.parse.urlparse(t).hostname or "").lower())


def base_domain(h):
    p = h.split(".")
    return ".".join(p[-2:]) if len(p) >= 2 else h


def name_key(s):
    s = re.sub(r"[\W_]+", "", (s or "").lower())
    return s if len(s) >= 4 else ""


ENTITY = [("ЧАСТНОЕ ОБРАЗОВАТЕЛЬНОЕ УЧРЕЖДЕНИЕ ДОПОЛНИТЕЛЬНОГО ПРОФЕССИОНАЛЬНОГО ОБРАЗОВАНИЯ", "ЧОУ ДПО"),
          ("АВТОНОМНАЯ НЕКОММЕРЧЕСКАЯ ОРГАНИЗАЦИЯ ДОПОЛНИТЕЛЬНОГО ПРОФЕССИОНАЛЬНОГО ОБРАЗОВАНИЯ", "АНО ДПО"),
          ("ЧАСТНОЕ ОБРАЗОВАТЕЛЬНОЕ УЧРЕЖДЕНИЕ", "ЧОУ"), ("АВТОНОМНАЯ НЕКОММЕРЧЕСКАЯ ОРГАНИЗАЦИЯ", "АНО"),
          ("ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ", "ООО"), ("НЕПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО", "АО"),
          ("ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО", "ПАО"), ("АКЦИОНЕРНОЕ ОБЩЕСТВО", "АО"), ("ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ", "ИП")]


def short_entity(n):
    n = re.sub(r"\s+", " ", (n or "").strip())
    up = n.upper()
    for long, short in ENTITY:
        pos = up.find(long)
        if pos < 0:
            continue
        before = n[:pos].strip()
        if before and len(before) <= 6 and " " not in before:
            before = ""
        n = ((before + " ") if before else "") + short + " " + n[pos + len(long):].strip()
        break
    return n.strip()


def title_core(t):
    t = (t or "").lower().replace("ё", "е")
    t = re.sub(r"\([^)]*\)", " ", t).split(":")[0]
    t = re.sub(r"\+.*$", "", t)
    t = re.sub(r"\s+в эпоху ии\b", "", t)
    t = re.sub(r"[.,]\s*(самостоятельн|продвинут|расширенн|персональн).*$", "", t)
    t = re.sub(r"\s+(расширенн\S*|\d+)$", "", t.strip())
    return re.sub(r"\s+", " ", t).strip()


def same_course(a, b):
    a, b = title_core(a), title_core(b)
    m = min(len(a), len(b))
    if m == 0:
        return True
    k = 0
    while k < m and a[k] == b[k]:
        k += 1
    return k / m >= 0.6


def txt(el, tag):
    x = el.find(tag)
    return (x.text or "").strip() if x is not None and x.text else ""


def parse_feed(data, label=""):
    root = ET.fromstring(data)
    shop = root.find("shop")
    if shop is None:
        raise ValueError("Файл не похож на YML-фид")
    company = txt(shop, "company") or txt(shop, "name") or "feed"
    key = company.lower()
    school_name = SCHOOL_NAMES.get(key, label or company)
    cats = {c.get("id"): clean_category(c.text or "") for c in shop.iter("category")}
    offers = {}
    for o in shop.iter("offer"):
        oid = (o.get("id") or "").strip()
        url = txt(o, "url")
        fid = f"{key}:{oid}"
        if not oid or not url.lower().startswith("https://") or fid in offers:
            continue
        params = {(p.get("name") or "").strip().lower(): (p.text or "").strip() for p in o.findall("param")}
        par = lambda rx: next((v for k, v in params.items() if re.search(rx, k) and v), "")
        title = txt(o, "name") or (txt(o, "typePrefix") + " " + txt(o, "model")).strip()
        title = re.sub(r"\s+", " ", title.replace(NBSP, " ").replace("­", "")).strip()
        archived = bool(re.match(r"^[(\[](архив|nfs)[)\]]", title, re.I))
        title = re.sub(r"^ДО\s+", "", title)
        p = num(txt(o, "price"))
        old = num(txt(o, "oldprice"))
        if old is None:
            old = num(txt(o, "old_price"))
        cr = num(txt(o, "min_credit_payment_sum"))
        if cr is None:
            cr = num(txt(o, "credit_price"))
        if cr is None:
            cr = num(par(r"оплата в рассрочку|ежемесячная цена по скидке"))
        profession = txt(o, "type_frontend").lower() == "profession"
        price = "" if p is None or (p == 0 and profession) else ("Бесплатно" if p == 0 else money(p))
        dur_el = o.find("duration")
        duration = fmt_duration(par(r"продолжительност|длительност"), dur_el.get("unit", "") if dur_el is not None else "")
        if not duration and dur_el is not None:
            duration = fmt_duration(dur_el.text, dur_el.get("unit", ""))
        erid = txt(o, "erid") or par(r"erid") or url_param(url, "erid")
        offers[fid] = dict(url=url, title=title, school=txt(o, "vendor") or school_name, price=price,
                           oldprice=money(old) if old is not None and p is not None and old > p > 0 else "",
                           monthly=f"от {money(cr)}/мес" if cr is not None and p is not None and 0 < cr < p else "",
                           duration=duration, category=cats.get(o.findtext("categoryId", "").strip(), ""), erid=erid,
                           available=(o.get("available", "").lower() != "false") and not archived, error="")
    by_url = {}
    for fid, of in offers.items():
        if of["available"]:
            by_url.setdefault(of["url"], []).append(fid)
    for fids in by_url.values():
        if len(fids) > 1 and any(not same_course(offers[a]["title"], offers[b]["title"]) for i, a in enumerate(fids) for b in fids[i + 1:]):
            for fid in fids:
                offers[fid]["error"] = "одна ссылка у разных курсов"
    return dict(company=company, key=key, school=school_name, offers=offers)


# ---------- сеть ----------
def http_get(url, timeout=90):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read(MAX_FEED + 1)
    if len(data) > MAX_FEED:
        raise ValueError("Ответ больше 60 МБ")
    return data


def advcake(key, path, **q):
    err = None
    for base in API_BASES:
        url = base + path + "?" + urllib.parse.urlencode({"pass": key, **q})
        try:
            j = json.loads(http_get(url, 60))
        except Exception as e:  # noqa: BLE001
            err = RuntimeError(str(e).replace(key, "***"))
            continue
        if isinstance(j, dict) and j.get("success") is False:
            raise RuntimeError(f"API AdvCake: {j.get('error') or j.get('message') or 'ошибка'} ({path})")
        return j
    raise err


def rows(j):
    return j.get("data", []) if isinstance(j, dict) else (j if isinstance(j, list) else [])


def advcake_offers(key):
    out, limit = {}, 500
    for page in range(40):
        j = advcake(key, "/offers", with_landings=0, limit=limit, offset=page * limit)
        d = rows(j)
        if not d:
            break
        was = len(out)
        for o in d:
            if isinstance(o, dict):
                out[str(o.get("id", len(out)))] = o
        total = int((j.get("total") if isinstance(j, dict) else 0) or 0)
        if len(d) < limit or (total and len(out) >= total) or len(out) == was:
            break
    return list(out.values())


def find_feeds(key):
    res = []
    for path in ("/feeds", "/common-feeds"):
        try:
            for f in rows(advcake(key, path, limit=500)):
                u = str(f.get("url") or "")
                if u and str(f.get("format") or "yml").lower() in ("yml", "xml", ""):
                    res.append({"url": u, "label": str(f.get("title") or "")})
        except Exception as e:  # noqa: BLE001
            print("Поиск фидов", path, ":", e)
    seen, uniq = set(), []
    for f in res:
        if f["url"] not in seen:
            seen.add(f["url"])
            uniq.append(f)
    return uniq


def api_no(v):
    return v is False or v == 0 or str(v).strip().lower() in ("0", "false", "no", "n", "нет", "off")


# ---------- обновление каталога (как run_update в lib.php) ----------
FIELDS = ("url", "title", "school", "price", "oldprice", "monthly", "duration", "category", "erid", "fid", "hidden", "adv", "inn", "added", "top")


def update(site):
    key = os.environ.get("ADVCAKE_KEY", "").strip()
    if not key:
        print("ADVCAKE_KEY не задан — пересобираю страницу из сохранённого каталога")
        return render(site)
    data_dir = pathlib.Path(site) / "data"
    data_dir.mkdir(exist_ok=True)
    cpath, spath = data_dir / "courses.json", data_dir / "courses-state.json"
    courses = json.loads(cpath.read_text(encoding="utf-8")) if cpath.exists() else []
    state = json.loads(spath.read_text(encoding="utf-8")) if spath.exists() else {"excluded": [], "feed_counts": {}}
    extra = pathlib.Path(site) / "data" / "courses-feeds.txt"          # дополнительные фиды вручную, по одному на строку
    feeds = find_feeds(key) + ([{"url": l.strip(), "label": ""} for l in extra.read_text(encoding="utf-8").splitlines() if l.strip().startswith("http")] if extra.exists() else [])
    today = datetime.datetime.now(MSK).strftime("%Y-%m-%d")
    report = {"time": datetime.datetime.now(MSK).strftime("%Y-%m-%d %H:%M"), "feeds": [], "added": [], "hidden": [], "restored": []}
    by_fid = {c["fid"]: c for c in courses if c.get("fid")}
    for f in feeds:
        fr = {"feed": f["label"] or urllib.parse.urlparse(f["url"]).path[-40:], "ok": False, "offers": 0, "note": ""}
        try:
            feed = parse_feed(http_get(f["url"]), f["label"])
            offers = feed["offers"]
            fr["offers"] = len(offers)
            last = state["feed_counts"].get(f["url"], 0)
            suspicious = last > 0 and len(offers) < last * 0.5
            if suspicious:
                fr["note"] = f"курсов стало намного меньше ({len(offers)} вместо {last}) — скрытие отключено"
            prefix = feed["key"] + ":"
            for c in courses:
                if not c.get("fid", "").startswith(prefix):
                    continue
                o = offers.get(c["fid"])
                if o and o["available"] and not o["error"]:
                    for k in ("url", "price", "oldprice", "monthly", "duration", "category", "erid"):
                        c[k] = o[k]
                    if c.get("hidden", "").startswith("feed_"):
                        c["hidden"] = ""
                        report["restored"].append(c["title"])
                elif not suspicious and not c.get("hidden"):
                    c["hidden"] = "feed_missing" if not o else ("feed_error" if o["error"] else "feed_unavailable")
                    report["hidden"].append(c["title"])
            for fid, o in offers.items():
                if fid in by_fid or fid in state["excluded"] or not o["available"] or o["error"] or not is_ai_course(o["title"], o["category"]):
                    continue
                c = {k: "" for k in FIELDS}
                c.update({k: o[k] for k in ("url", "title", "school", "price", "oldprice", "monthly", "duration", "category", "erid")})
                c.update(fid=fid, added=today)
                courses.append(c)
                by_fid[fid] = c
                report["added"].append(c["title"])
            state["feed_counts"][f["url"]] = len(offers)
            fr["ok"] = True
        except Exception as e:  # noqa: BLE001
            fr["note"] = str(e).replace(key, "***")[:200]
        report["feeds"].append(fr)
    try:
        lst = advcake_offers(key)
        by_host, by_base, by_name = {}, {}, {}
        for of in lst:
            h = re.sub(r"^www\.", "", (urllib.parse.urlparse(str(of.get("website_url") or "")).hostname or "").lower())
            if h:
                by_host[h] = of
                by_base[base_domain(h)] = of
            nm = name_key(of.get("name"))
            if nm:
                by_name[nm] = of
        miss = set()
        for c in courses:
            h = target_host(c["url"])
            of = by_host.get(h) or by_base.get(base_domain(h))
            if not of:
                sk = name_key(c["school"])
                of = next((o2 for nm, o2 in by_name.items() if sk and (nm in sk or sk in nm)), None)
            if not of:
                miss.add(c["school"])
                continue
            adv = of.get("advertiser") or {}
            if adv.get("entity_name"):
                c["adv"] = short_entity(adv["entity_name"])[:400]
            if adv.get("entity_tin"):
                c["inn"] = str(adv["entity_tin"])[:20]
            stopped = ("active" in of and api_no(of["active"])) or ("available" in of and api_no(of["available"]))
            if stopped and not c.get("hidden"):
                c["hidden"] = "offer_stopped"
                report["hidden"].append(c["title"] + " (программа остановлена)")
            if not stopped and c.get("hidden") == "offer_stopped":
                c["hidden"] = ""
                report["restored"].append(c["title"])
        report["api"] = f"программ: {len(lst)}" + (f"; нет программы для: {', '.join(sorted(miss))}" if miss else "")
    except Exception as e:  # noqa: BLE001
        report["api"] = "ошибка: " + str(e).replace(key, "***")[:200]
    cpath.write_text(json.dumps(courses, ensure_ascii=False, indent=1), encoding="utf-8")
    spath.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
    (data_dir / "courses-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=1)[:4000])
    return render(site)


# ---------- страница ----------
def visible(courses):
    """Показываем только размеченную рекламу: есть erid и рекламодатель с ИНН."""
    ok = [c for c in courses if not c.get("hidden") and c.get("erid") and c.get("adv") and c.get("inn") and c.get("url", "").startswith("https://")]
    top = sorted([c for c in ok if c.get("top")], key=lambda c: int(c["top"]) if str(c["top"]).isdigit() else 999)
    rest, by_school = [c for c in ok if not c.get("top")], {}
    for c in rest:
        by_school.setdefault(c["school"], []).append(c)
    mixed = []
    for i in range(max((len(v) for v in by_school.values()), default=0)):   # вперемешку по школам, как mix_schools
        mixed += [v[i] for v in by_school.values() if i < len(v)]
    return top + mixed


def card(c):
    e = lambda s: html.escape(str(s or ""), quote=True)
    price = f'<b>{e(c["price"])}</b>' if c.get("price") else "<b>Цена на сайте школы</b>"
    old = f' <s>{e(c["oldprice"])}</s>' if c.get("oldprice") else ""
    monthly = f'<span class="kc-m">{e(c["monthly"])}</span>' if c.get("monthly") else ""
    meta = " · ".join(e(x) for x in (c.get("school"), c.get("duration")) if x)
    return (f'<article class="kc" data-fid="{e(c.get("fid"))}"><div class="kc-top"><span class="kc-s">{meta}</span></div>'
            f'<h3 class="kc-t">{e(c["title"])}</h3>'
            f'<div class="kc-p">{price}{old}{monthly}</div>'
            f'<a class="kc-go" href="{e(c["url"])}" target="_blank" rel="noopener sponsored nofollow">Подробнее о курсе</a>'
            f'<p class="kc-ad">Реклама · {e(c["adv"])} · ИНН {e(c["inn"])} · erid: {e(c["erid"])}</p></article>')


def jsonld(courses, url):
    items = []
    for i, c in enumerate(courses[:100], 1):
        it = {"@type": "Course", "name": c["title"], "description": f'{c["title"]} — онлайн-курс {c["school"]}',
              "provider": {"@type": "Organization", "name": c["school"]}, "url": c["url"],
              "hasCourseInstance": {"@type": "CourseInstance", "courseMode": "online"}}
        n = num(c.get("price", "").replace("₽", "")) if c.get("price") not in ("", "Бесплатно") else (0 if c.get("price") == "Бесплатно" else None)
        if n is not None:
            it["offers"] = {"@type": "Offer", "price": n, "priceCurrency": "RUB", "category": "Paid" if n else "Free"}
        items.append({"@type": "ListItem", "position": i, "item": it})
    return {"@context": "https://schema.org", "@type": "ItemList", "name": "Курсы по нейросетям и ИИ", "url": url, "numberOfItems": len(courses), "itemListElement": items}


def blocks(courses, url="https://binap.ru/kursy-ii/"):
    vis = visible(courses)
    data = [{k: c.get(k, "") for k in ("fid", "title", "school", "price", "oldprice", "monthly", "duration", "category", "url", "erid", "adv", "inn")} for c in vis]
    return {"CARDS": "\n".join(card(c) for c in vis),
            "DATA": '<script type="application/json" id="kc-data">' + json.dumps(data, ensure_ascii=False).replace("</", "<\\/") + "</script>",
            "JSONLD": ('<script type="application/ld+json">' + json.dumps(jsonld(vis, url), ensure_ascii=False).replace("</", "<\\/") + "</script>") if vis else "",
            "COUNT": str(len(vis)), "SCHOOLS": str(len({c["school"] for c in vis}))}


def fill(page, b):
    for name, val in b.items():
        page = re.sub(rf"(<!--{name}-->).*?(<!--/{name}-->)", lambda m: m.group(1) + val + m.group(2), page, flags=re.S)
    return page


def render(site):
    site = pathlib.Path(site)
    cpath = site / "data" / "courses.json"
    courses = json.loads(cpath.read_text(encoding="utf-8")) if cpath.exists() else []
    page_path = site / "kursy-ii" / "index.html"
    if not page_path.exists():
        print("Нет страницы kursy-ii/index.html")
        return 1
    page_path.write_text(fill(page_path.read_text(encoding="utf-8"), blocks(courses)), encoding="utf-8")
    print(f"Курсов на странице: {len(visible(courses))} из {len(courses)}")
    return 0


if __name__ == "__main__":
    cmd, site = (sys.argv[1:3] + ["", ""])[:2]
    sys.exit(update(site) if cmd == "update" else render(site) if cmd == "render" else print(__doc__) or 2)
