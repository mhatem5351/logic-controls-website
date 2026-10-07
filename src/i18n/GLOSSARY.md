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
| Scan cycle / scan time (PLC) | One pass of the PLC program: read inputs, run the logic, write outputs | — | دورة المسح · زمن دورة المسح (never the English "scan" in Arabic copy). ControlLoop spec chip: "PID · دورة المسح 10 ms", with no-break spaces inside "دورة المسح 10 ms" so a narrow card breaks only after "PID ·" ("زمن دورة المسح" wraps the chip at 360) |
| HMI event source (alarm/event list) | Source column of the HMI demo's event list: SEQ / MODE / RCP | — | التسلسل / الوضع / الوصفة, always with the article (bare "وضع" is ambiguous without diacritics) |

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
| Case study | One published project write-up | — | دراسة حالة · دراسات الحالة on the projects pages (card CTA "اقرأ دراسة الحالة", filters, projects H1) and in the case-study WhatsApp message; مشروع / مشروعكم in the contact-form context lines (see "Contact form (quote request) terms") |
| Did you mean … (404) | Suggestion of the page the visitor probably wanted | — | هل تقصد صفحة {page}؟ ({page} is a page title or a bare path, so "صفحة" is needed) |

## Machines and processes

| EN term | Meaning on this site | Keep? | Preferred Arabic |
|---|---|---|---|
| CIP (cleaning-in-place) | Automatic cleaning of a machine without dismantling it | Keep "CIP" | التنظيف الموضعي (CIP) |
| Pasteurizer | Machine that heats product to a set temperature for a set time | — | ماكينة بسترة |
| HTST (high-temperature, short-time) | Continuous pasteurization: product heated to a high temperature and held for a short time | Keep "HTST"; explain on first use | بسترة بنظام HTST (درجة حرارة عالية لزمن قصير) · وحدة بسترة HTST |
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
| Syrup preparation / jet mixing (jet mixer tank) | Making beverage syrup in tanks mixed by recirculated jets | Keep "Radial Jet Mixing System" (HMI name) | تحضير السيرب (Syrup) · الخلط النفاث · خزانات الخلط النفاث (Jet mixer) |
| CIP-ready interlock | Sequence blocked until the CIP system reports ready | — | حماية جاهزية CIP |
| Ultrafiltration | Membrane filtration of liquids | Gloss | الترشيح الفائق (Ultrafiltration) |
| Ampoule filling machine | Fills and seals glass ampoules | — | ماكينة تعبئة الأمبولات |
| EMS / BMS | Environmental monitoring / building management systems in pharma areas | Keep "EMS", "BMS" | المراقبة البيئية (EMS) · أنظمة BMS |
| Purified water (utility) | Pharma-grade water system | Gloss | المياه النقية (Purified water) |
| Classic relay / hard-wired control | Control with relays and wiring instead of a PLC | — | التحكم الكلاسيكي بالريلايات والتوصيلات السلكية |
| EPLAN Electric P8 / SQL / ISA-88 | Panel-design software / database / batch-control standard | Keep | Keep; ISA-88 only as "وفق مبادئ المعيار ISA-88" (never معتمد / مطابق) |
| Wax filling and capping (cosmetics) | Filling depilatory/cosmetic wax and fitting caps | — | تعبئة الواكس (الشمع) وتركيب الأغطية (Capping) |

## Names, places and legal terms

| EN term | Keep? | Preferred Arabic |
|---|---|---|
| Logic Controls | Keep (Latin) | Logic Controls (transliteration لوجيك كنترولز only where Latin cannot be used) |
| 6th of October City / New October | — | مدينة السادس من أكتوبر (مدينة 6 أكتوبر where space is tight) / أكتوبر الجديدة. In short labels (hero chips, eyebrows) write «مدينة 6 أكتوبر», never a bare «6 أكتوبر», which reads as the date 6 October |
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

## Arabic search terms Egyptian buyers use

The formal MSA terms above stay the default in body copy. Egyptian plant engineers and owners also search with colloquial-technical forms. Use them in Arabic titles, H1s, intros and meta descriptions where they read naturally: once per title or H1, never stuffed, and keep the formal term nearby in the body.

| Search term | Use it for | Example in the copy |
|---|---|---|
| لوحات كنترول / لوحة كنترول | Control panels (titles, H1s, panel-build scope) | home title "لوحات كنترول وبرمجة PLC وأتمتة المصانع في مصر"; control-panels H1 "التصميم الكهربائي وتصنيع لوحات كنترول PLC" |
| لوحات تحكم كهربائية | Control panels (descriptions, body) | home description |
| برمجة PLC | PLC programming | titles and H1s |
| أوتوميشن | Industrial automation; gloss it once: "الأتمتة الصناعية (الأوتوميشن)" | services index H1, about lead and title |
| سكادا | SCADA; write "نظام SCADA (سكادا)" or "أنظمة سكادا" | SCADA service title, home description |
| صيانة PLC / صيانة الماكينات / الانفرترات | Maintenance and troubleshooting | maintenance title "صيانة PLC والانفرترات وماكينات المصانع في مصر" |

Review the Search Console queries 6 to 8 weeks after a change and adjust.

## Project facts labels (case-study "Project facts" table)

`projects.items[slug].facts[]` reuses a small set of labels so the table reads the same on every case study. Values contain only facts already in the copy or `projects.ts`.

| EN | AR | ZH | TR |
|---|---|---|---|
| Equipment | الماكينة / النظام / المحطة | 设备 / 系统 | Makine / Sistem / Santral |
| Our scope | نطاق عملنا | 工作范围 | Kapsamımız |
| Project type | نوع المشروع | 项目类型 | Proje türü |
| PLC / Controller | PLC / وحدة التحكم | PLC / 控制器 | PLC / Kontrolör |
| HMI / SCADA | شاشة HMI / نظام SCADA | HMI / SCADA | HMI / SCADA |
| Drives / Drive | الانفرترات / الانفرتر / الدرايفرات | 变频器 / 驱动 | Sürücüler / Sürücü |
| Operating modes | أوضاع التشغيل | 运行模式 | Çalışma modları |
| Recipes / Programs / Program editor | الوصفات / البرامج / محرر البرامج | 配方 / 程序 / 程序编辑器 | Reçeteler / Programlar / Program editörü |
| Records / Reports | السجلات / التقارير | 记录 / 报告 | Kayıtlar / Raporlar |
| Controlled | نطاق التحكم | 控制对象 | Kontrol edilenler |
| Handover | التسليم | 移交 | Teslim |
| Commissioning | الاختبار والتشغيل | 调试 | Devreye alma |
| Plant interface | الربط مع المصنع | 工厂接口 | Tesis arayüzü (not "Tesis bağlantısı", which reads as a physical connection) |
| Materials dosed | جرعات المواد | 计量物料 | Dozajlanan malzemeler |
| Label checks | فحص الليبل | 标签检测 | Etiket kontrolü |
| Panel (components in the cabinet) | مكونات اللوحة | 柜内元件 (not 电控柜) | Pano |
| Access and records | الصلاحيات والسجلات | 权限与记录 | Erişim ve kayıtlar |
| Measured values | القيم المقاسة | 测量值 | Ölçülen değerler |
| Product safety | سلامة المنتج | 产品安全 | Ürün güvenliği |
| Motion / Network / Pumps | الحركة / الشبكة / المضخات | 运动控制 / 网络 / 泵 | Hareket kontrolü / Ağ / Pompalar |
| Chemical inputs / Wash programs | مداخل الكيماويات / برامج الغسيل | 化料输入 / 洗涤程序 | Kimyasal girişler / Yıkama programları |

## Machine builders (OEM) path

| EN | AR | ZH | TR |
|---|---|---|---|
| Machine builder (OEM) | مُصنِّع الماكينات (OEM) | 设备制造商 (OEM) | Makine üreticisi (OEM) |
| Commissioning on your behalf | التشغيل نيابةً عنك | 代表您进行调试 | Sizin adınıza devreye alma |
| Local commissioning and service | تشغيل وصيانة محلية | 本地调试与服务 | Yerel devreye alma ve servis |

Never "partner", "agent", "authorized service center" or "official representative" of a machine or control brand.

## Chinese and Turkish anchors (for native review)

| EN | 中文 (suggested) | Türkçe (suggested) |
|---|---|---|
| Control panel | 电气控制柜 | Otomasyon panosu (kumanda panosu only in photo alt texts) |
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

## Contact form (quote request) terms

Used in `contact.json` (form, validation, errors, thanks) and `privacy.json`. Keep them identical across the form, its
error messages, the thanks page and the privacy notice.

| EN | Arabic | 中文 | Türkçe |
|---|---|---|---|
| Quote request / request | طلب عرض سعر / الطلب | 询价需求 / 需求 | Teklif talebi / talep |
| Request number (LC-XXXXX) | رقم الطلب | 需求编号 | Talep numarası |
| Attachments / files you attach | الملفات التي ترفقها | 您附加的文件 | Eklediğiniz dosyalar |
| Choose files / Add more files | اختر الملفات / أضف ملفات أخرى | 选择文件 / 继续添加文件 | Dosya seçin / Başka dosya ekleyin |
| Drag and drop (files) | اسحبها وأفلتها | 拖放 | Sürükleyip bırakın |
| Photo reduced for sending | صُغِّر حجم الصورة للإرسال | 照片已压缩以便发送 | Fotoğraf gönderim için küçültüldü |
| Not attached (content does not match the file type) | تعذّر إرفاق… لأن محتواها لا يطابق نوع الملف | 未能附加……文件内容与格式不符 | Eklenemedi… içeriği dosya türüyle uyuşmuyor |
| Uploading files… / Upload progress | جارٍ رفع الملفات… / تقدّم رفع الملفات | 正在上传文件…… / 上传进度 | Dosyalar yükleniyor… / Yükleme durumu |
| Preferred channel (reply) | وسيلة التواصل المفضلة | 首选联系方式 | Tercih ettiğiniz kanal |
| Country code (phone) | رمز الدولة | 国家或地区代码 | Ülke kodu |
| A machine is stopped (urgent) | ماكينة متوقفة | 设备已停机 | Makine durdu |
| Reference call (with a past client) | التحدث مع عميل سابق | 联系参考客户 / 与过往客户交流 | Referans görüşmesi |
| Case study | مشروع (من مشروعاتنا) | 案例 | Proje (referans proje) |
| Session storage (form draft) | التخزين المؤقت لجلسة المتصفح (session storage) | 会话存储（session storage） | Oturum depolaması (session storage) |
| Click counts | إحصاءات النقرات | 点击统计 | Tıklama sayıları / tıklama istatistikleri |
| Send request / Skip and send now (the form's two send buttons; named in the privacy notice) | «إرسال الطلب» / «تخطَّ وأرسل الآن» | “提交需求” / “跳过并立即提交” | “Talebi gönder” / “Atla ve şimdi gönder” |
| Send without the files (button after an upload that timed out) | أرسل الطلب دون الملفات | 不附文件直接提交 | Dosyalar olmadan gönder |
| Not sent with your request (files left out after a slow upload) | لم تُرسَل مع طلبك | 未随需求发送 | Talebinizle birlikte gönderilemeyen dosyalar |

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
| HTST (high-temperature, short-time) | HTST（高温短时） | Gloss on first use per page; the tag "HTST-01" stays Latin |
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
| Syrup preparation / jet mixer tank | 糖浆制备 / 射流混合罐 | "Radial Jet Mixing System" = 径向射流混合系统（Radial Jet Mixing System） |
| CIP-ready interlock | CIP 就绪联锁 | |
| Ultrafiltration / ampoule filler | 超滤系统 / 安瓿灌装机 | |
| EMS (sterile areas) / BMS / purified water | 环境监测系统（EMS）/ BMS / 纯化水系统 | Recommissioning = 重新调试 |
| Classic relay / hard-wired control | 传统继电器控制 / 硬接线控制 | |
| SQL reports / OEE dashboard | SQL 报表 / OEE 看板 | Plant-wide OEE platforms remain out of scope |
| ISA-88 principles | 参照 ISA-88 原则 | Never 符合 / 认证 |
| Chocolate cooker / bakery line | 巧克力熬煮锅 / 烘焙生产线 | Edible-oil and liquid-egg fillers = 食用油与液蛋灌装机 |
| Wax filling and capping | 蜡类产品灌装旋盖机 | |
| Founder | 创始人 | Not used on the site since October 2026 (the founder asked not to be featured) |
| Scan cycle / scan time (PLC) | 扫描周期 | ControlLoop chip: `PID · 扫描周期 10 ms` |
| Forward / divert (FDV, HMI) | 出料 / 回流 | Tour step "Wait for Forward" = 等待进入“出料” |
| Quote (short CTA) / quote form | 询价 / 询价表单 | The visitor's action is 询价; 报价 is what we send (the long CTA 获取报价 stays) |
| Panel (facts label, tech group) | 柜内元件 · 柜内元件与网络 | Not 电控柜; the cabinet itself stays 控制柜 / 电气控制柜 |
| Front-loading washer-extractor | 前开门式洗脱两用机 | |
| Checked on the bench (before installation) | 台架检查 · 在台架上运行 | |
| From the site (gallery eyebrow) | 现场实拍 | The gallery title is 项目照片, so the eyebrow avoids repeating 照片 |
| Did you mean {page}? (404) | 您是不是要找：{page} | Colon form: {page} may be a zh name, a name starting with Latin, or a bare path |
| Image {n} of {total} (viewer) | 第 {n} 张，共 {total} 张 | The short visible counter stays `{n} / {total}` |
| Try the live demo | 体验实时演示 | Matches the HMI eyebrow HMI 实时演示 |
| Submit buttons named in running text | “提交需求”或“跳过并立即提交” | Name the buttons exactly as rendered (privacy notice: both send the data); photos made smaller = 压缩 |

**Places.** Sources: Xinhua, China Daily, MOFCOM country guide. Names marked * have no single Chinese-media spelling, so the Latin name follows in brackets.

| EN | 中文 |
|---|---|
| 6th of October City / New October* | 十月六日城 / 新十月城（New October） |
| Obour City* | 奥布尔城（Obour） |
| Badr City | 巴德尔城 |
| 10th of Ramadan City | 斋月十日城 |
| Sadat City | 萨达特城 |
| Borg El Arab / New Borg El Arab* | 阿拉伯堡 / 新阿拉伯堡（Borg El Arab）. Variants: 阿拉伯堡, 博格阿拉伯 |
| Ain Sokhna | 艾因苏赫纳. Variant: 苏赫奈泉, used in TEDA coverage |
| Qantara West / East Port Said | 西坎塔拉 / 东塞得港 |
| SCZONE | 苏伊士运河经济区（SCZONE） |
| GAFI | 埃及投资与自由区管理总局（GAFI） |
| Governorates | 吉萨省, 开罗省, 盖勒尤比省, 东部省, 曼努菲亚省, 亚历山大省, 苏伊士省, 伊斯梅利亚省, 塞得港省 |
| Greater Cairo / Nile Delta | 大开罗地区 / 尼罗河三角洲 |
| PDPL No. 151 of 2020 / PDP Center | 2020 年第 151 号《个人数据保护法》 / 个人数据保护中心 |

## Turkish (tr): conventions and decisions used in `messages/tr/`

**Register and typography.** Polite "siz" address, short plain business sentences. Turkish characters everywhere (ç, ğ, ı, İ, ö, ş, ü); capital İ for "İlaç", "İskenderiye", "İsmailiye". Suffixes on abbreviations and names follow pronunciation, after an apostrophe: PLC'ler / PLC'yi / PLC'den, HMI'lar / HMI'da / HMI'yı, SCADA'yı, VFD'ler, Wecon'u, Siemens'in, Logic Controls'un / 'tan, Mısır'da, Türkiye'den, 2025'te, 50'den / 50'yi. Multi-word place names take the apostrophe on the last word (6 Ekim Şehri'nde, Büyük Kahire'de). Where a suffix would sit on CIP, I/O, FAT, SAT, GAFI or a model number, rephrase instead (CIP çevrimleri, I/O noktaları). Modbus also gets no suffix ("Modbus ağları", "Modbus haberleşmesi"); Turkish engineers read it with a u, so if a suffix is unavoidable write Modbus'u / Modbus'a. In short labels (hero chips, eyebrows) write "6 Ekim Şehri", never a bare "6 Ekim", which reads as the date 6 October.

**Claims.** "Designed following IEC … practice" = "IEC 60204-1 ve IEC 61439 uygulamaları esas alınarak tasarlanır". Never "uygun", "uyumlu", "sertifikalı", "yetkili", "partner/iş ortağı" for brands. "We do not issue UL listing / CE marking" = "UL listelemesi veya CE işaretlemesi yapmıyoruz". "On request" = "talep halinde". Never claim Turkish-speaking staff: engineers work in Arabic and English ("Arapça ve İngilizce çalışır"); visitors can write in Turkish through the site; Turkish versions of key documents are "talep halinde". Where the English tells local readers our engineers "speak your language", the Turkish says "operatörlerinizle Arapça konuşan" / "Arapça iletişim kuran", so a Turkish reader does not read it as Turkish. CTAs use the aorist ("size dönüş yaparız", "öneririz"), matching the English "we will".

| EN | Türkçe (used) | Note |
|---|---|---|
| Control panel | otomasyon panosu · PLC otomasyon panosu | Used everywhere in copy. "Kumanda panosu" only in photo alt texts (the physical cabinet) and component terms (motor kumanda, kumanda trafosu). `ui.json` nav and footer now say "Otomasyon panoları" / "PLC otomasyon panoları" too. |
| Electrical design / schematics / panel layout | elektrik tasarımı / elektrik şemaları / pano yerleşim planı | |
| I/O list / BOM | I/O listesi / malzeme listesi (BOM) | |
| As-built drawings | as-built çizimler | Turkish engineers use the English term |
| Ferrules and wire numbers | kablo yüksükleri ve kablo numaraları | |
| Contactor / overload relay / circuit breaker / terminals | kontaktör / termik röle / devre kesici / klemens | |
| VFD / variable-speed drive | frekans invertörü (VFD) · VFD | Brand lists: "LS Electric M100 VFD'ler" |
| Stepper drive / motion control | step motor sürücüsü / hareket kontrolü | |
| Sequence | sekans | "çalışma sırası" only in plain-language CTAs |
| Interlock | kilitleme (interlock) | Glossed in the process steps and on the PLC programming page; plain "kilitleme" elsewhere |
| Setpoint / actual value | set değeri / gerçek (anlık) değer | Not "ayar değeri". On HMI controls: "ısıtma set değeri", "set değerini artır / düşür" |
| (Control) logic | lojik · kontrol lojiği · lojik testleri | Not "mantık", which reads as everyday reasoning |
| Tag (instrument / alarm tag, e.g. TT-102) | Tag | Column header in alarm tables stays "Tag". Not "etiket" (label, clashes with labeling machines) |
| Blocked (interlock / permissive status) | Engellendi | Not "Engelli" (= disabled person) |
| Recipe / step recipe | reçete / adım reçetesi | |
| Process mimic / overview | proses mimik ekranı / proses genel görünümü | |
| Alarm history / user log-in / access levels | alarm geçmişi / kullanıcı girişi / yetki seviyeleri | |
| Data logging / traceability | veri kaydı / izlenebilirlik | |
| Changeover | ürün değişimi | |
| Commissioning / start-up / tuning | devreye alma / ilk çalıştırma / ince ayar | "From design to start-up" = "tasarımdan ilk çalıştırmaya". Parameter tuning = parametre ayarı |
| Loop check | loop testi | |
| Punch list / commissioning observations | eksik listesi (punch list) / devreye alma bulguları | |
| Handover | teslim | |
| Site visit / survey | saha ziyareti / keşif | Trace the wiring = kablo takibi |
| Nameplates | cihaz etiketleri · motor, sürücü ve PLC etiketleri | Not "etiket plakası" |
| Witness (FAT/SAT) | şahitlik · testlere katılım ve şahitlik | Not "tanıklık" |
| Phase (of a process cycle) | aşama · çok aşamalı çevrim | Not "faz", which reads as an electrical phase ("faz kontrolü" = phase monitoring) |
| Retrofit / brand migration | makine modernizasyonu (retrofit) / marka geçişi | SEO titles may use "Makine Retrofit" |
| Troubleshooting / preventive maintenance | arıza giderme · arıza tespiti / önleyici bakım | |
| Support agreement / response time | teknik destek sözleşmesi / müdahale süresi | |
| Case study (meta descriptions) | Proje: … | Page label "Read case study" = "Projeyi inceleyin". Avoid "Referanslar" (implies a named client list) |
| Pasteurizer / holding time / FDV | pastörizatör / bekletme süresi / akış yönlendirme vanası (FDV) | |
| HTST (high-temperature, short-time) | HTST (yüksek sıcaklık, kısa süre) | Gloss on first use per page; the tag "HTST-01" stays Latin |
| Raw tank (process mimic) | ham ürün tankı | Not "ham tank" |
| CIP | CIP (yerinde temizlik) | |
| Plate heat exchanger / balance tank / hot-water loop | plakalı eşanjör / denge tankı / sıcak su devresi | |
| Autoclave / retort / sterilization | otoklav / retort / sterilizasyon | |
| Cheese cooker / double jacket | peynir pişirme makinesi / çift ceket | |
| Tablet coating machine | tablet (film) kaplama makinesi | Pan speed = tambur hızı; spray rate = püskürtme debisi; blower = üfleyici |
| Filling machine (piston, multi-nozzle) / gate | (çok nozullu) pistonlu dolum makinesi / stoper | |
| Labeling machine / dispense length | etiketleme makinesi / etiket bırakma uzunluğu | |
| Bottle printing machine | şişe baskı makinesi | |
| Batching / dosing | harmanlama · parti (batch) / dozajlama | Process-control service title = "… CIP ve harmanlama". Concrete: beton santrali, "dozaj ve karıştırma"; bins = bunkerler; hoppers = tartım hazneleri; aggregates = agrega; additives = katkı maddesi |
| Washer-extractor / linen | yıkama-sıkma makinesi · endüstriyel çamaşır makinesi / çamaşır, tekstil ürünleri | Commercial laundry = endüstriyel çamaşırhane · çamaşırhane |
| IEC 61439 gloss | alçak gerilim şalt ve kumanda panoları | Descriptive gloss, not a quoted TSE title |
| Dairy (sector) | süt ürünleri | Not bare "süt" (reads as milk) |
| Test rig / test bench | test düzeneği / test tezgâhı | |
| Make / Break values | sıkma (make) / sökme (break) değerleri | |
| Process skid | proses ünitesi (skid) | |
| Qualification (pharma) / GMP validation | kalifikasyon / GMP validasyonu | |
| Syrup preparation / jet mixer tank | şurup hazırlama / jet karıştırma tankı | "Radial Jet Mixing System" = radyal jet karıştırma sistemi (Radial Jet Mixing System); circulation = sirkülasyon |
| CIP-ready interlock | CIP hazır kilitlemesi | |
| Pressure switch | basınç şalteri | |
| Ultrafiltration / ampoule filler | ultrafiltrasyon sistemi / ampul dolum makinesi | |
| EMS (sterile areas) / BMS / purified water | çevresel izleme (EMS) / BMS / saf su (purified water) | Recommissioning = yeniden devreye alma |
| Classic relay / hard-wired control | klasik röleli kumanda / kablolu (hard-wired) kumanda | |
| SQL reports / OEE dashboard | SQL tabanlı raporlar / OEE gösterge ekranı | Not "OEE panosu" ("pano" = electrical panel) |
| ISA-88 principles | ISA-88 prensipleri esas alınarak | Never "uyumlu" / "sertifikalı" |
| Chocolate cooker / bakery line | çikolata pişirme kazanı / unlu mamul hattı | Edible-oil and liquid-egg fillers = sıvı yağ ve sıvı yumurta dolum makineleri |
| Wax filling and capping (cosmetics) | ağda (wax) dolum ve kapak kapatma | Cosmetic wax = ağda, not "mum" (candle) |
| Founder | kurucu | Not used on the site since October 2026 (the founder asked not to be featured) |
| Scan time (PLC) | tarama süresi | ControlLoop chip "PID · 10 ms tarama süresi". Not bare "tarama" |
| Safety temperature (pasteurizer FDV) | emniyet sıcaklığı | Not "güvenlik sıcaklığı" (alt, solution, facts and caption agree) |
| Plant interface (facts label) | tesis arayüzü | Not "tesis bağlantısı" (reads as a physical connection) |
| Checked on the bench (before installation) | test tezgâhında | Never "atölyede": it implies a company workshop, which the client does not have |
| Call an engineer (button) | Mühendisimizi arayın | Not "Bir mühendisi arayın". In running text: "hemen mühendisimizi arayın". The dative CTAs stay: "Bir mühendise WhatsApp'tan yazın" / "e-posta gönderin" |
| Case studies (filter results heading) | Projeler | Not "Proje incelemeleri" (calque) |
| Did you mean {page}? (404) | {page} sayfasını mı arıyordunuz? | {page} is a page-name link or a bare path, so nothing is suffixed to it. Not the search-engine "Bunu mu demek istediniz:" |
| Image {n} of {total} (gallery, screen readers) | Görsel {n}, toplam {total} · "(görsel {n}, toplam {total}; tam boyutta açılır)" | Not "{n} / {total}" (read aloud as "bölü") and not "{total} görselden {n}." (ordinal dot). The visible counter stays "{n} / {total}" |
| "Video." at the end of a meta description | Video içerir. | Not "Videolu." |
| Submit buttons named in running text | “Talebi gönder” veya “Atla ve şimdi gönder” düğmesi | Name the buttons exactly as rendered (privacy notice: both send the data) |

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
