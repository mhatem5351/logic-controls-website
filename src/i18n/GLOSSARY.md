# Glossary (EN → AR, with ZH/TR anchors)

Use this to keep the four languages consistent. "Keep" = write the term in Latin script exactly as in English (an Arabic, Chinese or Turkish gloss may follow in brackets on first use per page). Arabic renderings follow the wording Egyptian engineers and the client's own posts use. Chinese and Turkish anchors are suggestions for the native reviewers.

## Core automation terms

| EN term | Meaning on this site | Keep? | Preferred Arabic |
|---|---|---|---|
| PLC | Programmable logic controller that runs the machine logic | Keep | PLC (وحدة تحكم منطقي مبرمجة on first use) · برمجة PLC |
| HMI | Operator touch screen on the machine | Keep | شاشة HMI · شاشة التشغيل |
| SCADA | PC-based supervisory screens, alarms and records for a process | Keep | نظام SCADA (سكادا) |
| VFD / variable-speed drive | Drive that controls motor speed | Keep "VFD" | انفرتر (VFD) · مغيّر سرعة |
| Stepper drive | Drive for a stepper motor (positioning) | Gloss | درايفر ستيبر (Stepper drive) |
| Motion control | Controlled positioning and synchronization of axes | Gloss | التحكم في الحركة (Motion control) |
| Control panel | Enclosure with PLC, protection, starters and wiring | — | لوحة تحكم · لوحات تحكم |
| Electrical design | Drawings and calculations for power and control circuits | — | التصميم الكهربائي |
| Schematic drawings | Wiring diagrams of power and control circuits | — | المخططات الكهربائية |
| I/O, I/O list | Inputs and outputs of the controller; the list of all signals | Keep "I/O" | المداخل والمخارج (I/O) · قائمة الـ I/O |
| Bill of materials (BOM) | List of all components | Keep "BOM" | قائمة المكونات (BOM) |
| As-built drawings | Drawings updated to match what was installed | — | مخططات ما بعد التنفيذ (As-built) |
| Interlock | Logic that blocks an action until conditions are safe or correct | Gloss | حمايات التشغيل (Interlocks) · الـ Interlock |
| Alarm | Message shown on the HMI when a fault or limit occurs | — | إنذار · الإنذارات |
| Recipe | Stored set of settings for one product or program | — | وصفة · الوصفات (Recipes) |
| Setpoint (SV) / actual value (PV) | Target value / measured value | Keep "SV", "PV" | القيمة المطلوبة (SV) / القيمة الفعلية (PV) |
| Manual / automatic mode | Operating modes of the machine | — | تشغيل يدوي / تشغيل أوتوماتيك |
| Sequence | Ordered steps of a machine cycle | — | تسلسل التشغيل |
| Data logging | Recording process values and events | — | تسجيل البيانات |
| Traceability | Ability to show what happened to each batch or test | — | التتبع |
| User log-in / access levels | Operator accounts that limit who changes settings | — | تسجيل دخول المستخدمين / صلاحيات المستخدمين |
| Alarm history | Stored list of past alarms with time stamps | — | سجل الإنذارات |
| Modbus RTU / Modbus TCP / PROFINET / RS-485 | Industrial communication standards | Keep | Keep |
| 4-20 mA, 0-10 V | Analog signal ranges | Keep | Keep |
| RTD, thermocouple | Temperature sensors | Keep "RTD"; gloss thermocouple | حساس حرارة RTD · ثيرموكبل |
| Encoder | Sensor that measures position or length | Gloss | إنكودر (Encoder) |
| Load cell | Weighing sensor | Gloss | خلية وزن (Load cell) |
| Contactor, overload relay, relay, circuit breaker | Panel components | Gloss | كونتاكتور · أوفرلود · ريلاي · قاطع (Circuit breaker) |
| PID / proportional control | Closed-loop control methods | Keep "PID" | تحكم PID · تحكم تناسبي |

## Project and service terms

| EN term | Meaning on this site | Keep? | Preferred Arabic |
|---|---|---|---|
| Testing and commissioning | Checks, start-up and tuning until the system is ready for production | Gloss | الاختبار والتشغيل (Testing & Commissioning) |
| Start-up | First run of the system under real conditions | — | بدء التشغيل |
| Tuning | Adjusting parameters for best performance | — | ضبط البارامترات |
| I/O check / I/O testing | Testing every signal between field device and controller | Gloss | اختبار المداخل والمخارج (I/O Testing) |
| Loop check | Checking an instrument loop from end to end | Gloss | اختبار الحلقات (Loop check) |
| FAT | Factory acceptance test at the machine builder | Keep | اختبار القبول في مصنع المورّد (FAT) |
| SAT | Site acceptance test at the plant | Keep | اختبار القبول في الموقع (SAT) |
| Punch list | List of open points to close before handover | Gloss | قائمة الملاحظات المتبقية (Punch list) |
| Handover | Formal transfer of the system to the client | — | التسليم |
| Retrofit / control upgrade | Replacing a machine's old controls, keeping its mechanics | — | تطوير وتحديث نظام التحكم للماكينة · تطوير الماكينات |
| Brand migration | Moving to another PLC or HMI platform | — | الترحيل إلى منصة تحكم أخرى |
| Troubleshooting | Finding and fixing faults | — | تشخيص وإصلاح الأعطال |
| Preventive maintenance | Planned checks to avoid breakdowns | — | الصيانة الوقائية |
| Support agreement | Written agreement for visits, response times and changes | — | عقد دعم فني وصيانة |
| Spare parts / critical spares | Replacement parts; the ones a line cannot run without | — | قطع الغيار / قطع الغيار الحرجة |
| HMI localization | Translating HMI screens and alarms, here into Arabic | — | تعريب شاشات HMI |
| Machine builder (OEM) | Company that manufactures the machine | Keep "OEM" | مُصنِّع الماكينات (OEM) |
| Platforms we program and integrate | Our relationship to brands (not a partnership) | — | منصات نبرمجها وندمجها (never وكلاء / شركاء معتمدون) |
| Designed following … practice | Our standards wording (not certification) | — | مصممة وفق ممارسات المعيار … (never مطابقة / معتمدة) |

## Machines and processes

| EN term | Meaning on this site | Keep? | Preferred Arabic |
|---|---|---|---|
| CIP (cleaning-in-place) | Automatic cleaning of a machine without dismantling it | Keep "CIP" | التنظيف الموضعي (CIP) |
| Pasteurizer | Machine that heats product to a set temperature for a set time | — | ماكينة بسترة |
| Flow-diversion valve (FDV) | Valve that returns under-temperature product | Keep "FDV" | صمام تحويل التدفق (FDV) |
| Plate heat exchanger | Heat exchanger made of plates | — | مبادل حراري بالألواح |
| Autoclave / retort | Pressure vessel for sterilization | — | أوتوكلاف |
| Sterilization | Killing microorganisms with heat and pressure | — | التعقيم |
| Cheese cooker | Heated mixing vessel for processed cheese | — | ماكينة طهي الجبن |
| Tablet coating machine | Drum that sprays a film coat on tablets | — | ماكينة تغليف الأقراص الدوائية (Coating) |
| Filling machine (piston, multi-nozzle) | Machine that doses liquid into bottles | — | ماكينة تعبئة (مكبس، متعددة الرؤوس) |
| Labeling machine | Machine that applies self-adhesive labels | — | ماكينة الليبل (ماكينة لصق الملصقات) |
| Bottle printing machine | Machine that prints on bottles | — | ماكينة طباعة الزجاجات |
| Batching plant | Plant that weighs and mixes materials, here concrete | — | محطة خلط الخرسانة |
| Dosing | Adding a measured quantity | — | الجرعات · التحكم في الجرعات |
| Washer-extractor | Industrial washing machine with spin extraction | — | غسالة فنادق (غسالة عصّارة) |
| Test rig / testing machine | Machine that tests products, here pipes | — | ماكينة اختبار |
| Make and break values | Test values shown on the pipe tester (ft·lb, psi) | Keep "Make", "Break" in brackets | قيم عزم الربط (Make) والفك (Break) — ft·lb is a torque unit (make-up / break-out torque); the client's posts say التحمل والكسر, confirm with client |
| Anaerobic reactor / waste treatment | Biological treatment of plant waste | — | مفاعل لاهوائي · معالجة المخلفات |

## Names, places and legal terms

| EN term | Keep? | Preferred Arabic |
|---|---|---|
| Logic Controls | Keep (Latin) | Logic Controls (transliteration لوجيك كنترولز only where Latin cannot be used) |
| 6th of October City / New October | — | مدينة السادس من أكتوبر (6 أكتوبر where space is tight) / أكتوبر الجديدة |
| Obour City | — | مدينة العبور |
| Badr City | — | مدينة بدر |
| 10th of Ramadan City | — | مدينة العاشر من رمضان |
| Sadat City | — | مدينة السادات |
| Borg El Arab / New Borg El Arab | — | برج العرب / برج العرب الجديدة |
| Ain Sokhna, TEDA zone | Keep "TEDA" | العين السخنة، منطقة تيدا (TEDA) |
| Qantara West | — | القنطرة غرب |
| East Port Said | — | شرق بورسعيد |
| SCZONE (Suez Canal Economic Zone) | Keep "SCZONE" | المنطقة الاقتصادية لقناة السويس (SCZONE) |
| GAFI | Keep "GAFI" | الهيئة العامة للاستثمار والمناطق الحرة (GAFI) |
| Greater Cairo | — | القاهرة الكبرى |
| Personal Data Protection Law No. 151 of 2020 | — | قانون حماية البيانات الشخصية رقم 151 لسنة 2020 |
| Personal Data Protection Center | — | مركز حماية البيانات الشخصية |
| IEC 60204-1, IEC 61439, UL, CE | Keep | Keep |

## Chinese and Turkish anchors (for native review)

| EN | 中文 (suggested) | Türkçe (suggested) |
|---|---|---|
| Control panel | 电气控制柜 | Otomasyon panosu (service, SEO) · kumanda panosu (the physical panel in a project) |
| PLC programming | PLC 编程 | PLC programlama |
| HMI | HMI 触摸屏 · HMI 画面 (screens) | HMI · HMI ekranları · operatör paneli (HMI) |
| VFD | 变频器 (VFD) | Frekans invertörü (VFD) |
| Testing and commissioning | 测试与调试 | Test ve devreye alma |
| I/O check / loop check | I/O 测试 / 回路测试（not 点检, which reads as TPM inspection） | I/O testi · I/O kontrolü / loop testi |
| FAT / SAT | 工厂验收测试 (FAT) / 现场验收测试 (SAT) | Fabrika kabul testi (FAT) / Saha kabul testi (SAT) |
| Retrofit | 旧设备改造 · 控制系统升级 | Makine modernizasyonu (retrofit) / kontrol sistemi yenileme |
| Arabic HMI localization | HMI 阿拉伯语本地化 | HMI ekranlarının Arapçaya uyarlanması |
| Spare parts | 备件 · 关键备件 (critical spares) | Yedek parça · kritik yedek parçalar |
| Support agreement | 技术支持协议 | Teknik destek sözleşmesi |
| Recipe | 配方 | Reçete |
| Interlock | 联锁 | Kilitleme (interlock) |
| Machine builder (OEM) | 设备制造商 (OEM) | Makine üreticisi (OEM) |
| Industrial zone | 工业区 | Sanayi bölgesi |
| Ain Sokhna / TEDA | 艾因苏赫纳 / 中埃·泰达合作区（full: 中埃·泰达苏伊士经贸合作区） | Ain Sokhna / TEDA bölgesi |
| 10th of Ramadan | 斋月十日城 | 10. Ramazan Şehri |
| Platforms we program and integrate | 我们编程和集成的平台 | Programladığımız ve entegre ettiğimiz platformlar |

## Chinese (zh-Hans): conventions and decisions used in `messages/zh/`

**Typography.** Put a half-width space between Chinese characters and Latin words or digits (`PLC 与 HMI 编程`, `2025 年`, `{count} 个项目`). This matches `ui.json`. Put no space next to full-width punctuation (，。：；？！、（）“”《》). Use full-width brackets for glosses: `变频器（VFD）`. Exception: `{link}` in the consent line is replaced by Chinese text, so it has no spaces around it. Keep brand and model names in Latin, with no Chinese brand names (Siemens, not 西门子). The one exception is the Wecon（维控）gloss on the foreign-manufacturers page.

**Claims.** "Designed following IEC … practice" = `参照 IEC 60204-1 和 IEC 61439 的设计实践`. Never write 符合, 认证产品 or 合规. "We do not issue UL listing / CE marking" = `不出具 UL 认证或 CE 标志`. "On request" = `可应要求提供`. Never claim Chinese-speaking staff. The rule is: engineers work in Arabic and English (`使用阿拉伯语和英语工作`), and visitors can write to us in Chinese through the site. Where the English tells local readers that our engineers "speak your language", the Chinese says they speak the operators' or the local language (`用阿拉伯语与当地团队沟通` / `用当地操作人员的语言沟通`).

**Contact emphasis.** On zh pages, write "form or email" first and WhatsApp second (`如您在埃及，也可通过 WhatsApp…`). WhatsApp is blocked in mainland China.

| EN | 中文 (used) | Note |
|---|---|---|
| Commissioning / start-up / tuning | 调试 / 投运 / 参数整定 | "From design to start-up" = 从设计到投运 |
| Gradual start-up | 逐步投运 | |
| Punch list / closure | 尾项清单 / 尾项关闭 | Commissioning observations = 调试问题项 |
| Handover | 移交 | |
| Site visit / survey | 现场考察 / 勘查 | |
| Schematics / panel layout / cable list | 电气原理图 / 柜内布置图 / 电缆清单 | |
| I/O list / BOM | I/O 点表 / 物料清单 | |
| As-built drawings | 竣工图 | |
| Ferrules and wire numbers | 线号管、线号 | |
| Contactor / overload relay / circuit breaker | 接触器 / 热过载继电器 / 断路器 | |
| Stepper drive / motion control | 步进驱动器 / 运动控制 | |
| Sequence (machine) | 动作流程 · 顺序控制 | Step recipe = 步序配方 |
| Process mimic / overview | 工艺流程画面 / 工艺总览 | |
| Alarm history / user log-in | 历史报警 / 用户登录 | Access levels = 权限等级 |
| Data logging / traceability | 数据记录 / 追溯 | |
| Changeover | 换型 | |
| Troubleshooting / preventive maintenance | 故障排查 / 预防性维护 | |
| Brand migration | 平台迁移 | |
| Pasteurizer / holding time | 巴氏杀菌机 / 保持时间 | |
| FDV (flow-diversion valve) | 回流阀（FDV）· 回流联锁 | |
| CIP | CIP 就地清洗 (first use) · CIP | |
| Plate heat exchanger / balance tank | 板式换热器 / 平衡缸 | |
| Autoclave / retort | 杀菌釜 | |
| Cheese cooker | 奶酪蒸煮锅 | Double jacket = 夹套 |
| Tablet (film-)coating machine | 片剂（薄膜）包衣机 | Pan speed 锅体转速; spray rate 喷液速率; formulation 处方 |
| Filling machine (piston, 4-nozzle) | 灌装机（活塞式、四头） | Gate = 挡瓶门 |
| Labeling machine / missing-label detection | 贴标机 / 漏标检测 | Dispense length = 出标长度 |
| Bottle printing machine | 瓶身印刷机 | |
| Concrete batching plant | 混凝土搅拌站 | Mix recipe 配比配方; aggregates 骨料; additives 外加剂; hopper 称量斗 |
| Washer-extractor | 洗脱两用机 | Chemical dosing 化料投加; linen 布草 |
| Make / Break (pipe tester) | 上扣（Make）/ 卸扣（Break） | Make-up and break-out torque on threaded connections |
| Anaerobic waste treatment | 厌氧废弃物处理 | |
| Process skid | 工艺撬装设备 | |
| Qualification (pharma) | 确认（工作） | GMP validation = GMP 验证 |

**Places.** Sources: Xinhua, China Daily, MOFCOM country guide. Names marked * have no single Chinese-media spelling, so the Latin name follows in brackets.

| EN | 中文 |
|---|---|
| 6th of October City / New October* | 十月六日城 / 新十月城（New October） |
| Obour City* | 奥布尔城（Obour） |
| Badr City | 巴德尔城 |
| 10th of Ramadan City | 斋月十日城 |
| Sadat City | 萨达特城 |
| Borg El Arab / New Borg El Arab* | 阿拉伯塔 / 新阿拉伯塔（Borg El Arab）. Variants: 阿拉伯堡, 博格阿拉伯 |
| Ain Sokhna | 艾因苏赫纳. Variant: 苏赫奈泉, used in TEDA coverage |
| Qantara West / East Port Said | 西坎塔拉 / 东塞得港 |
| SCZONE | 苏伊士运河经济区（SCZONE） |
| GAFI | 埃及投资与自由区管理总局（GAFI） |
| Governorates | 吉萨省, 开罗省, 盖勒尤比省, 东部省, 曼努菲亚省, 亚历山大省, 苏伊士省, 伊斯梅利亚省, 塞得港省 |
| Greater Cairo / Nile Delta | 大开罗地区 / 尼罗河三角洲 |
| PDPL No. 151 of 2020 / PDP Center | 2020 年第 151 号《个人数据保护法》 / 个人数据保护中心 |

## Turkish (tr): conventions and decisions used in `messages/tr/`

**Register and typography.** Polite "siz" address, short plain business sentences. Turkish characters everywhere (ç, ğ, ı, İ, ö, ş, ü); capital İ for "İlaç", "İskenderiye", "İsmailiye". Suffixes on abbreviations and names follow pronunciation, after an apostrophe: PLC'ler / PLC'yi / PLC'den, HMI'lar / HMI'da / HMI'yı, SCADA'yı, VFD'ler, Wecon'u, Siemens'in, Logic Controls'un / 'tan, Mısır'da, Türkiye'den, 2025'te, 50'den / 50'yi. Multi-word place names take the apostrophe on the last word (6 Ekim Şehri'nde, Büyük Kahire'de). Where a suffix would sit on CIP, I/O, FAT, SAT, GAFI or a model number, rephrase instead (CIP çevrimleri, I/O noktaları).

**Claims.** "Designed following IEC … practice" = "IEC 60204-1 ve IEC 61439 uygulamaları esas alınarak tasarlanır". Never "uygun", "uyumlu", "sertifikalı", "yetkili", "partner/iş ortağı" for brands. "We do not issue UL listing / CE marking" = "UL listelemesi veya CE işaretlemesi yapmıyoruz". "On request" = "talep halinde". Never claim Turkish-speaking staff: engineers work in Arabic and English ("Arapça ve İngilizce çalışır"); visitors can write in Turkish through the site; Turkish versions of key documents are "talep halinde". Where the English tells local readers our engineers "speak your language", the Turkish says "operatörlerinizin dilini konuşan" (the operators' language), so a Turkish reader does not read it as Turkish.

| EN | Türkçe (used) | Note |
|---|---|---|
| Control panel | otomasyon panosu · PLC kumanda panosu | Service/SEO = otomasyon panosu; a specific panel in a project or photo = kumanda panosu. `ui.json` nav still says "Kontrol panoları" (design agent's file). |
| Electrical design / schematics / panel layout | elektrik tasarımı / elektrik şemaları / pano yerleşim planı | |
| I/O list / BOM | I/O listesi / malzeme listesi (BOM) | |
| As-built drawings | as-built çizimler | Turkish engineers use the English term |
| Ferrules and wire numbers | kablo yüksükleri ve kablo numaraları | |
| Contactor / overload relay / circuit breaker / terminals | kontaktör / termik röle / devre kesici / klemens | |
| VFD / variable-speed drive | frekans invertörü (VFD) · VFD | Brand lists: "LS Electric M100 VFD'ler" |
| Stepper drive / motion control | step motor sürücüsü / hareket kontrolü | |
| Sequence | sekans | "çalışma sırası" only in plain-language CTAs |
| Interlock | kilitleme (interlock) | Glossed in the process steps and on the PLC programming page; plain "kilitleme" elsewhere |
| Setpoint / actual value | set değeri / gerçek (anlık) değer | |
| Recipe / step recipe | reçete / adım reçetesi | |
| Process mimic / overview | proses mimik ekranı / proses genel görünümü | |
| Alarm history / user log-in / access levels | alarm geçmişi / kullanıcı girişi / yetki seviyeleri | |
| Data logging / traceability | veri kaydı / izlenebilirlik | |
| Changeover | ürün değişimi | |
| Commissioning / start-up / tuning | devreye alma / ilk çalıştırma / ayar | "From design to start-up" = "tasarımdan ilk çalıştırmaya" |
| Loop check | loop testi | |
| Punch list / commissioning observations | eksik listesi (punch list) / devreye alma bulguları | |
| Handover | teslim | |
| Site visit / survey | saha ziyareti / keşif | |
| Retrofit / brand migration | makine modernizasyonu (retrofit) / marka geçişi | SEO titles may use "Makine Retrofit" |
| Troubleshooting / preventive maintenance | arıza giderme · arıza tespiti / önleyici bakım | |
| Support agreement / response time | teknik destek sözleşmesi / müdahale süresi | |
| Case study (meta descriptions) | Proje: … | Page label "Read case study" = "Projeyi inceleyin" |
| Pasteurizer / holding time / FDV | pastörizatör / bekletme süresi / akış yönlendirme vanası (FDV) | |
| CIP | CIP (yerinde temizlik) | |
| Plate heat exchanger / balance tank / hot-water loop | plakalı eşanjör / denge tankı / sıcak su devresi | |
| Autoclave / retort / sterilization | otoklav / retort / sterilizasyon | |
| Cheese cooker / double jacket | peynir pişirme makinesi / çift ceket | |
| Tablet coating machine | tablet (film) kaplama makinesi | Pan speed = tambur hızı; spray rate = püskürtme debisi; blower = üfleyici |
| Filling machine (piston, multi-nozzle) / gate | (çok nozullu) pistonlu dolum makinesi / stoper | |
| Labeling machine / dispense length | etiketleme makinesi / etiket bırakma uzunluğu | |
| Bottle printing machine | şişe baskı makinesi | |
| Batching / dosing | harmanlama · parti (batch) / dozajlama | Concrete plant = beton santrali; bins = bunkerler; hoppers = tartım hazneleri; aggregates = agrega; additives = katkı maddesi |
| Washer-extractor / linen | yıkama-sıkma makinesi · endüstriyel çamaşır makinesi / çamaşır, tekstil ürünleri | |
| Test rig / test bench | test düzeneği / test tezgâhı | |
| Make / Break values | sıkma (make) / sökme (break) değerleri | |
| Process skid | proses ünitesi (skid) | |
| Qualification (pharma) / GMP validation | kalifikasyon / GMP validasyonu | |

**Places.** Sources: Turkish Wikipedia (governorates, 6 Ekim Şehri), Ekonomi Gazetesi and Dünya (10. Ramazan Şehri, Sadat, Sokhna, Qantara Batı). Turkish press has no settled form for Ain Sokhna ("Sokhna", "Ain Sokhna"); "Ayn Suhna" is not in use, so the Latin name is kept.

| EN | Türkçe |
|---|---|
| 6th of October City / New October | 6 Ekim Şehri / Yeni Ekim Şehri |
| Obour City / Badr City | Obour Şehri / Badr Şehri |
| 10th of Ramadan City | 10. Ramazan Şehri |
| Sadat City | Sadat Şehri |
| Borg El Arab / New Borg El Arab | Burg El Arab / Yeni Burg El Arab |
| Ain Sokhna, TEDA zone | Ain Sokhna, TEDA bölgesi |
| Qantara West / East Port Said | Batı Kantara / Doğu Port Said |
| SCZONE | Süveyş Kanalı Ekonomik Bölgesi (SCZONE); one-stop shop = tek durak ofisi |
| GAFI | Mısır Yatırım ve Serbest Bölgeler Genel Kurumu (GAFI) |
| Governorates | Gize, Kahire, Kalyubiye, Şarkiye, Minufiye, İskenderiye, Süveyş, İsmailiye, Port Said |
| Greater Cairo / Nile Delta | Büyük Kahire / Nil Deltası |
| PDPL No. 151 of 2020 / PDP Center | 2020 tarihli ve 151 sayılı Kişisel Verilerin Korunması Kanunu / Kişisel Verileri Koruma Merkezi |
