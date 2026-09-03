import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = path.resolve(process.argv[2] || "outputs/hr-original-parity-synthetic/inputs");
const onlyFiles = new Set(process.argv.slice(3));
const monthStart = new Date(Date.UTC(2019, 0, 1));
const monthEnd = new Date(Date.UTC(2026, 7, 1));
const reportingDate = new Date(Date.UTC(monthEnd.getUTCFullYear(), monthEnd.getUTCMonth() + 1, 0));

const brands = ["Aurelia", "Borealis", "Cyrene"];
const cities = ["Istanbul", "Ankara", "Izmir", "Bursa", "Antalya", "Adana", "Samsun", "Eskisehir", "Gaziantep", "Mugla", "Konya", "Trabzon"];
const regions = ["Marmara", "Central Anatolia", "Aegean", "Mediterranean", "Black Sea", "Southeast"];
const stores = cities.map((city, index) => ({
  code: `S${String(index + 1).padStart(3, "0")}`,
  name: `${brands[index % brands.length]}.GS.${city.toUpperCase()} ${String(index + 1).padStart(2, "0")}`,
  city,
  region: regions[index % regions.length],
  brand: brands[index % brands.length],
}));

function addMonths(date, count) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
}

function monthsBetween(start, end) {
  const result = [];
  for (let current = new Date(start); current <= end; current = addMonths(current, 1)) result.push(new Date(current));
  return result;
}

function isoMonth(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function day(date, value = 1) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), value));
}

function seeded(index, salt = 0) {
  const x = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function historicalDate(year, month, dayValue = 1) {
  const candidate = new Date(Date.UTC(year, month, dayValue));
  if (candidate <= reportingDate) return candidate;
  return new Date(Date.UTC(year - 1, month, dayValue));
}

const employees = Array.from({ length: 144 }, (_, index) => {
  const store = stores[index % stores.length];
  const corporate = index % 12 === 0;
  const hire = addMonths(new Date(Date.UTC(2017 + (index % 7), index % 12, 3 + (index % 20))), index % 8);
  const exits = index % 7 === 0 && index > 20;
  const exitCandidate = exits ? addMonths(new Date(Date.UTC(2023 + (index % 4), (index * 3) % 12, 15)), 0) : null;
  const exit = exitCandidate && exitCandidate <= reportingDate ? exitCandidate : null;
  const manager = index % 19 === 0;
  const assistant = !manager && index % 11 === 0;
  const title = corporate ? ["Veri Analisti", "Finans Uzmanı", "İnsan Kaynakları İş Ortağı", "Teknoloji Uzmanı"][index % 4]
    : manager ? "Mağaza Müdürü" : assistant ? "Mağaza Müdür Yardımcısı" : index % 9 === 0 ? "Kasiyer" : "Satış Danışmanı";
  return {
    id: String(99000001 + index),
    nationalId: `SYN-TC-${String(index + 1).padStart(6, "0")}`,
    name: `Synthetic Employee ${String(index + 1).padStart(4, "0")}`,
    first: "Synthetic",
    last: `Employee ${String(index + 1).padStart(4, "0")}`,
    gender: index % 2 ? "Female" : "Male",
    birth: new Date(Date.UTC(1978 + (index % 25), index % 12, 2 + (index % 25))),
    hire,
    exit,
    store,
    corporate,
    scope: corporate ? "Merkez" : "Mağaza",
    department: corporate ? ["Technology", "Finance", "People & Culture", "Marketing"][index % 4] : "Retail Operations",
    section: corporate ? ["Analytics", "Planning", "People Operations", "Brand"][index % 4] : "Store Team",
    title,
    role: title,
    cadre: !corporate && index % 12 === 1 ? "Belirsiz Süreli" : "Sürekli",
    collar: "Beyaz Yaka",
    salary: 28000 + (index % 30) * 1350 + (manager ? 26000 : assistant ? 13000 : 0),
  };
});

const months = monthsBetween(monthStart, monthEnd);
const activeAt = (employee, month) => employee.hire <= new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)) && (!employee.exit || employee.exit >= month);
const activeEmployees = employees.filter((employee) => !employee.exit || employee.exit >= monthEnd);
const exitedEmployees = employees.filter((employee) => employee.exit);

function excelColumnName(index) {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

async function writeWorkbook(filename, sheetDefs) {
  if (onlyFiles.size && !onlyFiles.has(filename)) {
    return { filename, skipped: true, sheets: sheetDefs.map((def) => ({ name: def.name, rows: def.rows.length, columns: def.headers.length })) };
  }
  const workbook = Workbook.create();
  for (const def of sheetDefs) {
    const sheet = workbook.worksheets.add(def.name);
    const rows = [def.headers, ...def.rows];
    const lastColumn = excelColumnName(def.headers.length - 1);
    sheet.getRange(`A1:${lastColumn}${rows.length}`).values = rows;
    sheet.getRange(`A1:${lastColumn}1`).format = {
      fill: "#17324D",
      font: { bold: true, color: "#FFFFFF" },
      wrapText: true,
      borders: { preset: "all", style: "thin", color: "#AFC3D3" },
    };
    if (rows.length > 1) {
      sheet.getRange(`A2:${lastColumn}${rows.length}`).format.borders = { preset: "all", style: "thin", color: "#D9E2E8" };
    }
    for (let col = 0; col < def.headers.length; col += 1) {
      if (def.rows.some((row) => row[col] instanceof Date)) {
        sheet.getRange(`${excelColumnName(col)}2:${excelColumnName(col)}${rows.length}`).format.numberFormat = "yyyy-mm-dd";
      }
    }
    sheet.freezePanes.freezeRows(1);
    sheet.getRange(`A1:${lastColumn}${Math.min(rows.length, 250)}`).format.autofitColumns();
    sheet.getRange(`A1:${lastColumn}${Math.min(rows.length, 250)}`).format.autofitRows();
    for (let col = 0; col < def.headers.length; col += 1) {
      const cell = sheet.getCell(0, col);
      if ((cell.format.columnWidth || 0) > 28) cell.format.columnWidth = 28;
    }
    sheet.showGridLines = false;
  }
  const exported = await SpreadsheetFile.exportXlsx(workbook);
  await exported.save(path.join(outputDir, filename));
  return { filename, sheets: sheetDefs.map((def) => ({ name: def.name, rows: def.rows.length, columns: def.headers.length })) };
}

await fs.mkdir(outputDir, { recursive: true });
const manifest = [];

const payrollHeaders = ["uid", "donem", "sicil_no", "tc_kimlik_no", "adi_soyadi", "ust_bolum", "departman", "isletme_kodu", "isletme_adi", "departman_adi", "bolum_adi", "gorev", "unvan", "kadro_adi", "cinsiyet", "beyaz_mavi_yaka", "dogum_tarihi", "maliyet_merkezi_kodu", "maliyet_merkezi_adi", "sgk_is_yeri_kodu", "sgk_isyeri_adi", "ise_giris_tarihi", "son_giris_tarihi", "cikis_tarihi", "ucret", "sgk_gun", "fazla_mesai_toplam", "prim_toplam", "kasa_tazminati", "net_gelir", "temiz_net_gelir", "ucret_turu"];
const payrollRows = [];
for (const month of months) {
  for (const employee of employees.filter((person) => activeAt(person, month))) {
    const bonus = Math.round(employee.salary * (0.02 + seeded(Number(employee.id.slice(3)), month.getUTCMonth()) * 0.08));
    const overtime = employee.corporate ? 0 : Math.round(seeded(Number(employee.id.slice(3)), month.getUTCFullYear()) * 24) * 100;
    const net = employee.salary + bonus + overtime;
    payrollRows.push([
      `${employee.id}-${isoMonth(month)}`, day(month), employee.id, employee.nationalId, employee.name, employee.scope,
      employee.department, employee.store.code, employee.store.name, employee.department, employee.section, employee.role,
      employee.title, employee.cadre, employee.gender, employee.collar, employee.birth, `CC-${employee.store.code}`,
      employee.store.name, `SGK-${employee.store.code}`, employee.store.name, employee.hire, employee.hire,
      employee.exit && isoMonth(employee.exit) === isoMonth(month) ? employee.exit : null, employee.salary, 30, overtime,
      bonus, employee.title === "Kasiyer" ? 900 : 0, net, net, "Aylık",
    ]);
  }
}
manifest.push(await writeWorkbook("icmal kayıt dosyası.xlsx", [{ name: "Sheet1", headers: payrollHeaders, rows: payrollRows }]));

manifest.push(await writeWorkbook("key_tablosu.xlsx", [{ name: "key_tablosu", headers: ["sicil", "isyeri_adi", "kisa_kodu", "m_kodu", "il"], rows: stores.map((store, index) => [index + 1, store.name, store.code, store.code, store.city]) }]));

const learningHeaders = ["izleme_dk", "donem", "etkinlik_adi", "sicil", "kullanıcı_adi", "kullanıcı_soyadi", "tamamlama_durumu", "puan", "toplam_deneyim_suresi_dk", "atanma_tarihi", "tamamlama_tarihi", "basari_durumu", "toplam_mobil_deneyim_suresi_dk", "kullanıcı_sicil", "toplam_oturum_suresi_saat", "etkinlik_baslangic_tarihi", "etkinlik_bitis_tarihi", "net_deneyim_suresi_dk", "net_mobil_deneyim_suresi_dk", "baslama_tarihi", "etkinlik_tamamlama_yuzdesi", "etkinlik_tahmini_sure_gun", "etkinlik_tahmini_sure_dk", "etkinlik_devam_sure_gun", "lokasyon", "departman", "pozisyon", "unvan", "bolge", "bayi", "bayi_adi"];
const courseNames = ["Customer Experience", "Product Knowledge", "Leadership Essentials", "Data Literacy", "Workplace Safety"];
const learningRows = [];
for (const employee of activeEmployees) {
  for (let courseIndex = 0; courseIndex < courseNames.length; courseIndex += 1) {
    const assigned = new Date(Date.UTC(2026, courseIndex, 3 + (Number(employee.id.slice(3)) % 20)));
    const completed = seeded(Number(employee.id.slice(3)), courseIndex) > 0.18;
    const minutes = 35 + courseIndex * 18 + (Number(employee.id.slice(3)) % 20);
    learningRows.push([completed ? minutes : Math.round(minutes * 0.45), assigned, courseNames[courseIndex], employee.id, employee.first, employee.last, completed ? "Completed" : "In Progress", completed ? 72 + (Number(employee.id.slice(3)) % 28) : null, minutes, assigned, completed ? addMonths(assigned, 1) : null, completed ? "Successful" : "Pending", Math.round(minutes * 0.2), employee.id, minutes / 60, assigned, new Date(Date.UTC(2026, 11, 31)), minutes, Math.round(minutes * 0.2), assigned, completed ? 100 : 45, 30, minutes, completed ? 10 : 120, employee.store.name, employee.department, employee.title, employee.title, employee.store.region, employee.store.brand, employee.store.name]);
  }
}
manifest.push(await writeWorkbook("enocta_tum_veri.xlsx", [{ name: "Sayfa1", headers: learningHeaders, rows: learningRows }]));

const scorecardHeaders = ["donem", "sicil", "isim_soyisim", "sd_satis", "sd_adet", "sd_upt", "sd_tds", "sd_fatura", "magaza_hgo", "magaza_nps", "magaza_kart_verme", "magaza_yeni_musteri", "toplam"];
const scorecardRows = [];
for (const month of months.filter((value) => value >= new Date(Date.UTC(2023, 0, 1)))) {
  for (const employee of employees.filter((person) => !person.corporate && activeAt(person, month))) {
    const base = 65 + Math.round(seeded(Number(employee.id.slice(3)), month.getUTCMonth() + month.getUTCFullYear()) * 32);
    scorecardRows.push([day(month), employee.id, employee.name, base, base - 3, base + 1, base - 2, base + 2, base - 1, base + 2, base - 4, base + 1, base]);
  }
}
manifest.push(await writeWorkbook("kumule_karne.xlsx", [{ name: "Sheet1", headers: scorecardHeaders, rows: scorecardRows }]));

const revenueRows = [];
for (const month of months.filter((value) => value >= new Date(Date.UTC(2023, 0, 1)))) {
  for (const store of stores) {
    const target = 2500000 + stores.indexOf(store) * 110000 + month.getUTCMonth() * 80000;
    const hgo = 0.82 + seeded(stores.indexOf(store), month.getUTCMonth() + month.getUTCFullYear()) * 0.32;
    revenueRows.push([day(month), isoMonth(month), store.code, store.name, target, Math.round(target * hgo), hgo * 100]);
  }
}
manifest.push(await writeWorkbook("magaza_hedef_ciro.xlsx", [{ name: "Sayfa1", headers: ["donem", "aralik", "mag_kod", "mag_adi", "ciro_hedef", "omni_ciro", "hgo"], rows: revenueRows }]));

const academyHeaders = ["uid", "yil", "donem", "egitim_donemi", "uzman_yonetici", "grup_no", "grup_adi", "sicil", "kisi_adi", "grup_lideri", "katilim_durumu", "terfi_durumu", "mezun", "ay", "yıl"];
const academyRows = activeEmployees.filter((employee) => !employee.corporate).map((employee, index) => [`AC-${employee.id}`, 2026, new Date(Date.UTC(2026, index % 8, 1)), index % 2 ? "Satış Akademisi" : "Liderlik Akademisi", index % 2 ? "Uzman" : "Yönetici", 1 + (index % 8), `Sentetik Grup ${1 + (index % 8)}`, employee.id, employee.name, `Synthetic Leader ${1 + (index % 6)}`, index % 9 === 0 ? "Katılmadı" : "Katıldı", index % 13 === 0 ? "Terfi" : "Değişiklik Yok", index % 10 === 0 ? "Mezun Değil" : "Mezun", 1 + (index % 8), 2026]);
manifest.push(await writeWorkbook("R2_new_gen.xlsx", [{ name: "Sheet1", headers: academyHeaders, rows: academyRows }]));

const contactHeaders = ["Sicil No", "Adı Soyadı", "İşletme", "Bölüm", "Cep Telefonu", "Şirket e-posta", "Özel e-posta", "Adres", "İl", "İlçe", "Acil Durum Kişisi", "Acil Durum Telefonu", "Yakınlık", "Not"];
const contactRows = employees.map((employee, index) => [employee.id, employee.name, employee.store.name, employee.department, `000-000-${String(index + 1).padStart(4, "0")}`, `synthetic.${String(index + 1).padStart(4, "0")}@example.test`, `demo.${String(index + 1).padStart(4, "0")}@example.test`, `Synthetic Address ${index + 1}`, employee.store.city, "Test District", `Synthetic Contact ${index + 1}`, "000-000-0000", "Test Contact", "Entirely synthetic record"]);
manifest.push(await writeWorkbook("calisan_iletisim_bilgileri.xlsx", [{ name: "Sayfa1", headers: contactHeaders, rows: contactRows }]));

const leaverHeaders = ["Sicil No", "Adı Soyadı", "İşletme Kodu", "İşletme", "Bölüm Kodu", "Bölüm Adı", "Ünite Kodu", "Ünite Adı", "SGK İşyeri Kodu", "SGK İşyeri", "Görev Kodu", "Görev Adı", "Personel Grubu Kodu", "Personel Grubu Adı", "Pozisyon Kodu", "Pozisyon Adı", "İşe Giriş Tarihi", "Son Giriş Tarihi", "Son Yasal Giriş", "Çıkış Tarihi", "Ayrılma Sebebi Grubu", "Ayrılma Sebebi", "Ayrılma Alt Nedeni", "Cinsiyet", "Kadro Adı", "Üst Bölüm", "İl"];
const exitReasons = ["Career Change", "Relocation", "Education", "Personal Reasons", "Compensation"];
const leaverRows = exitedEmployees.map((employee, index) => [employee.id, employee.name, employee.store.code, employee.store.name, "D01", employee.department, "U01", employee.section, `SGK-${employee.store.code}`, employee.store.name, "R01", employee.role, "P01", employee.cadre, "POS01", employee.title, employee.hire, employee.hire, employee.hire, employee.exit, index % 4 === 0 ? "Employer" : "Employee", exitReasons[index % exitReasons.length], `Synthetic ${exitReasons[index % exitReasons.length]}`, employee.gender, employee.cadre, employee.scope, employee.store.city]);
manifest.push(await writeWorkbook("Ayrilanlar_Listesi.xlsx", [{ name: "Sayfa1", headers: leaverHeaders, rows: leaverRows }]));

const fiiliHeaders = ["P_NO", "AD_SOYAD", "TC_KIMLIK", "ISLETME_KOD", "ISLETME_AD", "ISLETME_BILGI", "CALISAN_GRUP", "SGK_KOD", "LOKASYON", "BOLUM_ADI", "UST_BOLUM_ADI", "POZISYON_ADI", "UNVAN_ADI", "kadro_adı", "GOREV_ADI", "SGK_DURUMU", "ENGEL_STATUSU", "ADRES", "CINSIYET", "DOGUM_TARIHI", "YAS", "ILK_BASLAMA_TARIHI", "İŞYERİ_BAŞLAMA_TARİHİ", "KIDEM_YILI", "OGRENIM_DURUMU", "YAKA", "EMAIL", "TELEFON", "IL", "SGK_BELGE_TUR"];
const fiiliRows = activeEmployees.map((employee, index) => [employee.id, employee.name, employee.nationalId, employee.store.code, employee.store.name, employee.store.name, employee.scope, `SGK-${employee.store.code}`, employee.store.name, employee.corporate ? employee.section : employee.store.name, employee.corporate ? employee.scope : employee.store.region, employee.title, employee.title, employee.corporate ? employee.cadre : index % 3 === 0 ? "Part Time Personel" : "Belirsiz Süreli", employee.role, "Aktif", "SAĞLIKLI", `Synthetic Address ${index + 1}`, employee.gender, employee.birth, 2026 - employee.birth.getUTCFullYear(), employee.hire, employee.hire, (monthEnd - employee.hire) / (365.25 * 86400000), "Lisans", employee.collar, `synthetic.${String(index + 1).padStart(4, "0")}@example.test`, "000-000-0000", employee.store.city, "Standart"]);
manifest.push(await writeWorkbook("fiili_list.xlsx", [{ name: "ListTable", headers: fiiliHeaders, rows: fiiliRows }]));

manifest.push(await writeWorkbook("Calisan_Bilgisi_Raporu.xlsx", [{ name: "Sayfa1", headers: ["Sicil No", "Adı Soyadı", "Lokasyon", "Üst Bölüm", "Pozisyon", "Unvan", "Kadro", "İlk Başlama Tarihi"], rows: employees.map((employee) => [employee.id, employee.name, employee.store.name, employee.scope, employee.title, employee.title, employee.cadre, employee.hire]) }]));

const oldHeaders = ["uid", "yil", "donem", "egitim_donemi", "uzman_yonetici", "grup_no", "grup_adi", "sicil", "kisi_adi", "grup_lideri", "katilim_durumu", "terfi_durumu", "mezun", "ay", "yıl", "cinsiyet", "dogum_tarihi", "magaza", "bolge", "unvan", "giris_tarihi", "cikis_tarihi", "kidem_yil", "kidem_ay", "kidem_gun"];
manifest.push(await writeWorkbook("eski_kaynak.xlsx", [{ name: "Sayfa1", headers: oldHeaders, rows: academyRows.map((row, index) => { const employee = activeEmployees[index % activeEmployees.length]; return [...row, employee.gender, employee.birth, employee.store.name, employee.store.region, employee.title, employee.hire, employee.exit, 2026 - employee.hire.getUTCFullYear(), employee.hire.getUTCMonth(), employee.hire.getUTCDate()]; }) }]));

const exitSurveyHeaders = ["Dönem", "Sicil", "Çalışan Adı & Soyadı", "Mağaza/Departman", "Telefon Numarası", "Ayrılma Nedeni 1", "Ayrılma Nedeni 2", "Ayrılma Nedeni 3", "Yöneticiden Kaynaklanan Nedenler 1", "Yöneticiden Kaynaklanan Nedenler 2", "Yöneticiden Kaynaklanan Nedenler 3", "Ücret ve Yan Haklar 1", "Ücret ve Yan Haklar 2", "Ücret ve Yan Haklar 3", "Kariyer ve Gelişim Olanakları 1", "Kariyer ve Gelişim Olanakları 2", "Kariyer ve Gelişim Olanakları 3", "İş Koşulları ve Çalışma Şartları 1", "İş Koşulları ve Çalışma Şartları 2", "İş Koşulları ve Çalışma Şartları 3", "Kişisel Nedenler 1", "Kişisel Nedenler 2", "Kişisel Nedenler 3", "Hangi Sektöre Geçmeyi Planlıyorsunuz?", "Yeni Pozisyonunuz Nedir?", "Yeni pozisyonunuz, şu anki pozisyonunuza göre hangi seviyededir?", "Aurelia'yı çevrenize tavsiye eder misiniz?", "Gelecekte yeniden çalışma fırsatınız olsa, Aurelia ile tekrar çalışmayı tercih eder misiniz?", "Paylaşmak istediğiniz ek bir görüş veya öneriniz varsa lütfen belirtiniz.", "Not", "Pozisyon", "İşe Giriş Tarihi", "Çıkış Tarihi", "Ayrılma Sebebi"];
const exitSurveyRows = exitedEmployees.map((employee, index) => [employee.exit, employee.id, employee.name, employee.store.name, "000-000-0000", exitReasons[index % exitReasons.length], "Synthetic secondary reason", "Synthetic tertiary reason", index % 3 ? "None" : "Communication", "None", "None", index % 5 ? "Competitive" : "Below expectation", "Benefits", "Bonus", "Development", "Internal Mobility", "Training", "Workload", "Schedule", "Location", "Relocation", "Education", "Family", "Technology", "Senior Specialist", index % 2 ? "Higher" : "Same", index % 4 ? "Yes" : "No", index % 3 ? "Yes" : "No", "Synthetic survey response only.", "Synthetic", employee.title, employee.hire, employee.exit, exitReasons[index % exitReasons.length]]);
manifest.push(await writeWorkbook("cikis_sebepleri.xlsx", [{ name: "Sheet1", headers: exitSurveyHeaders, rows: exitSurveyRows }]));

const lostWorkforceRows = months
  .filter((value) => value >= new Date(Date.UTC(2024, 0, 1)))
  .flatMap((month) => employees
    .filter((employee, index) => activeAt(employee, month) && index % 12 < 4)
    .map((employee, index) => [day(month), employee.id, employee.scope, 1 + ((month.getUTCMonth() + index) % 6)]));
manifest.push(await writeWorkbook("isgucu_kaybi.xlsx", [{ name: "Sheet1", headers: ["donem", "sicil", "bolum", "toplam_izin"], rows: lostWorkforceRows }]));

const leaveBurdenRows = months.filter((value) => value >= new Date(Date.UTC(2024, 0, 1))).flatMap((month) => ["Mağaza", "Merkez"].map((scope, index) => [day(month), scope, 20 + month.getUTCMonth() + index * 8, 45000 + month.getUTCMonth() * 2500 + index * 15000, 8 + index * 4]));
manifest.push(await writeWorkbook("izin_yuku.xlsx", [{ name: "Sheet1", headers: ["donem", "alan", "gun", "tl", "kisi_sayisi"], rows: leaveBurdenRows }]));

const internationalHeaders = ["donem", "COUNTRY", "LOCATION", "BUDGET_COUNT", "BUDGET_TITLE", "_BUDGET_SALARY_", "NAME", "STATUS", "ACTUAL_COUNT", "ACTUAL_TITLE", "_ACTUAL_SALARY_", "EMP_NO.", "HUMANIST", "DEPARTMENT", "BRANCH", "JOINING_DATE", "MOBILE_NO.", "EMAIL_ADD", "GENDER", "DATE_OF_BIRTH", "AGE", "NATIONALITY", "MARITAL_STATUS", "BASIC_SALARY", "HOUSING_ALLOWANCE", "TRANSPORTATION_ALLOWANCE", "TOTAL_SALARY", "PASSPORT", "ISSUED_DATE", "EXPIRY_DATE", "VISA_NUMBER", "VISA_ISSUED_DATE", "VISA_END_DATE", "EID/CIVIL_NUMBER", "EID_ISSUED_DATE", "EID_END_DATE", "ACCOUNT_NUMBER", "BANK_NAME", "MOL_ID/WORK_PERMIT", "FLIGHT_TICKET_VALUE", "INSURANCE"];
const internationalRows = months.filter((value) => value >= new Date(Date.UTC(2025, 0, 1))).flatMap((month) => Array.from({ length: 12 }, (_, index) => [day(month), ["Testland", "Example Republic", "Demo Isles"][index % 3], `Synthetic Branch ${index + 1}`, 1, "Sales Advisor", 4200, `Synthetic International ${String(index + 1).padStart(3, "0")}`, "Active", 1, "Sales Advisor", 4100 + index * 50, `INT${String(index + 1).padStart(4, "0")}`, `SYN-HR-${index + 1}`, "International Retail", `Branch ${index + 1}`, new Date(Date.UTC(2021 + (index % 4), index % 12, 1)), "000-000-0000", `international.${index + 1}@example.test`, index % 2 ? "Female" : "Male", new Date(Date.UTC(1985 + index, index % 12, 1)), 41 - index, "Synthetic", "Not specified", 3200, 600, 300, 4100, `SYN-PASS-${index + 1}`, new Date(Date.UTC(2025, 0, 1)), new Date(Date.UTC(2030, 0, 1)), `SYN-VISA-${index + 1}`, new Date(Date.UTC(2025, 0, 1)), new Date(Date.UTC(2027, 0, 1)), `SYN-EID-${index + 1}`, new Date(Date.UTC(2025, 0, 1)), new Date(Date.UTC(2027, 0, 1)), `SYN-ACCOUNT-${index + 1}`, "Synthetic Bank", `SYN-PERMIT-${index + 1}`, 500, 300]));
manifest.push(await writeWorkbook("yurtdisi_veri_icmal.xlsx", [{ name: "Sheet1", headers: internationalHeaders, rows: internationalRows }]));

manifest.push(await writeWorkbook("gelisim_yolculuk.xlsx", [{ name: "Sheet1", headers: ["Kullanıcı Kodu", "Tamamlama Durumu", "Durum Oran"], rows: activeEmployees.map((employee, index) => [employee.id, index % 5 === 0 ? "In Progress" : "Completed", index % 5 === 0 ? 65 : 100]) }]));

const performanceHeaders = ["donem", "sicil", "isim_soyisim", "yetkinlik_puani", "120_li_yetkinlik_puani", "dengeli_karne_puani", "yetkinlik_puani_25", "dengeli_karne_puani_75", "performans_notu", "sonuc_notu", "not"];
const performancePeriods = [new Date(Date.UTC(2025, 11, 1)), new Date(Date.UTC(2026, monthEnd.getUTCMonth(), 1))];
const performanceRows = activeEmployees.flatMap((employee, index) => performancePeriods.map((period) => { const year = period.getUTCFullYear(); const score = 65 + Math.round(seeded(index, year) * 32); return [period, employee.id, employee.name, score, Math.min(120, score * 1.2), score + 2, score * 0.25, (score + 2) * 0.75, score >= 90 ? "A" : score >= 75 ? "B" : "C", score >= 75 ? "Successful" : "Development", "Synthetic performance assessment"]; }));
manifest.push(await writeWorkbook("performans_magaza_verileri.xlsx", [{ name: "Sheet1", headers: performanceHeaders, rows: performanceRows }]));

const disciplineRows = employees.filter((_, index) => index % 8 === 0).map((employee, index) => [employee.id, ["C001", "C002", "C010", "C019"][index % 4], historicalDate(2025 + (index % 2), index % 12, 5 + (index % 20)), "Synthetic policy record"]);
manifest.push(await writeWorkbook("cezalar.xlsx", [{ name: "sheet_1", headers: ["PERNO", "OCKOD", "TARIH", "ACIKLAMA"], rows: disciplineRows }]));

const normHeaders = ["Bölge", "Mağaza", "İl", "Marka", "Toplam", "Mağaza Müdürü", "Unnamed: 6", "Mağaza Müdür Yardımcısı", "Unnamed: 8", "Satış Danışmanı", "Unnamed: 10", "Kasiyer", "Unnamed: 12"];
const normRows = [["Synthetic", "Synthetic", "Synthetic", "Synthetic", "Synthetic", "Norm", "Actual", "Norm", "Actual", "Norm", "Actual", "Norm", "Actual"], ...stores.map((store) => [store.region, store.name, store.city, store.brand, 12, 1, 1, 1, 1, 9, 8, 1, 1])];
manifest.push(await writeWorkbook("norm_fiili_kadro.xlsx", [{ name: "Sayfa1", headers: normHeaders, rows: normRows }]));

const maternityHeaders = ["Sicil", "Adı Soyadı", "TC Kimlik", "Mağaza", "Pozisyon", "Çıkış Tar.", "Rapor Bitiş Tar.", "Ücretsiz İzin Baş.Tar.", "Ücretsiz İzin Bit.Tar.", "Dönüş tarihi", "Açıklama"];
const maternityRows = activeEmployees.filter((employee, index) => employee.gender === "Female" && index % 16 === 0).map((employee, index) => [employee.id, employee.name, employee.nationalId, employee.store.name, employee.title, null, new Date(Date.UTC(2026, 4 + (index % 3), 1)), new Date(Date.UTC(2026, 5 + (index % 3), 1)), new Date(Date.UTC(2026, 7 + (index % 3), 1)), new Date(Date.UTC(2026, 7 + (index % 3), 2)), "Synthetic leave scenario"]);
manifest.push(await writeWorkbook("dogum_listesi.xlsx", [{ name: "Sayfa1", headers: maternityHeaders, rows: maternityRows }]));

const hiringHeaders = ["Dönem", "Sicil No", "Tc Kimlik No", "Adı Soyadı", "Üst Bölüm", "Departman", "İşletme Adı", "Bölüm Adı", "Görev", "Ünvan", "Kadro Adı", "Cinsiyet", "Beyaz/Mavi Yaka", "İşe Giriş Tarihi", "Çıkış Tarihi", "Pozisyon Açılma Tarihi", "Teklif Tarihi", "Pozisyon Açık Gün Sayısı", "Pozisyon Doldurma Süresi", "Yıl", "İşletme Kodu", "İl", "Bölge", "Aday Kaynağı", "Teklif Durumu", "Not"];
const hiringRows = employees.filter((employee) => employee.hire >= new Date(Date.UTC(2020, 0, 1))).map((employee, index) => { const fillDays = 12 + (index % 52); const opened = new Date(employee.hire.getTime() - fillDays * 86400000); return [day(employee.hire), employee.id, employee.nationalId, employee.name, employee.scope, employee.department, employee.store.name, employee.section, employee.role, employee.title, employee.cadre, employee.gender, employee.collar, employee.hire, employee.exit, opened, new Date(employee.hire.getTime() - 3 * 86400000), fillDays + 5, fillDays, employee.hire.getUTCFullYear(), employee.store.code, employee.store.city, employee.store.region, ["Referral", "Career Site", "Internal"][index % 3], "Accepted", "Synthetic hiring record"]; });
manifest.push(await writeWorkbook("ise_alma_suresi.xlsx", [{ name: "Sayfa1", headers: hiringHeaders, rows: hiringRows }]));

const checklistHeaders = ["Kullanıcı Kodu", "Adı", "Soyadı", "Onay Durumu", "Kullanıcı Durumu", "Tamamlama Durumu", "Başarı Durumu", "Puanı", "Atanma Tarihi", "Başlama Tarihi", "Tamamlama Tarihi", "E-posta", "Yönetici Adı", "Yönetici E-posta", "Sicil Numarası", "LOKASYON", "DEPARTMAN", "POZISYON", "SIRKET", "BÖLGE", "BAYİ", "BAYİ ADI", "Kontrol Listesi", "Süre", "Not"];
const checklistRows = activeEmployees.map((employee, index) => [employee.id, employee.first, employee.last, "Approved", "Active", index % 8 === 0 ? "In Progress" : "Completed", index % 8 === 0 ? "Pending" : "Successful", index % 8 === 0 ? 70 : 100, new Date(Date.UTC(2026, 0, 5)), new Date(Date.UTC(2026, 0, 6)), index % 8 === 0 ? null : new Date(Date.UTC(2026, 1, 3)), `synthetic.${index + 1}@example.test`, `Synthetic Manager ${1 + (index % 8)}`, `manager.${1 + (index % 8)}@example.test`, employee.id, employee.store.name, employee.department, employee.title, "Aizanoi Analytics Synthetic Demo", employee.store.region, employee.store.brand, employee.store.name, "Store Operations Checklist", 45, "Synthetic checklist"]);
manifest.push(await writeWorkbook("check_list.xlsx", [{ name: "Sayfa1", headers: checklistHeaders, rows: checklistRows }]));

manifest.push(await writeWorkbook("isg_veri.xlsx", [{ name: "Sayfa1", headers: ["P_NO", "AD_SOYAD", "ISLETME_AD", "Katılım Durumu", "Mağaza/Bayi", "Mağaza"], rows: activeEmployees.map((employee, index) => [employee.id, employee.name, employee.store.name, index % 10 === 0 ? "Not Attended" : "Attended", employee.store.name, employee.store.name]) }]));

const mandatoryHeaders = ["KULLANICI KODU", "ADI", "SOYADI", "TAMAMLAMA DURUMU", "PUANI", "ATANMA TARİHİ", "TAMAMLAMA TARİHİ", "BAŞARI DURUMU", "TOPLAM DENEYİM SÜRESİ (DK)", "ETKİNLİK ADI", "LOKASYON", "DEPARTMAN", "POZİSYON", "UNVAN", "BÖLGE", "BAYİ", "BAYİ ADI", "KULLANICI SİCİL", "BAŞLAMA TARİHİ", "ETKİNLİK TAMAMLAMA YÜZDESİ", "ETKİNLİK BAŞLANGIÇ TARİHİ", "ETKİNLİK BİTİŞ TARİHİ", "NET DENEYİM SÜRESİ (DK)", "TOPLAM MOBİL DENEYİM SÜRESİ (DK)", "NET MOBİL DENEYİM SÜRESİ (DK)", "TOPLAM OTURUM SÜRESİ (SAAT)", "ETKİNLİK TAHMİNİ SÜRE (GÜN)", "ETKİNLİK TAHMİNİ SÜRE (DK)", "ETKİNLİK DEVAM SÜRE (GÜN)", "DÖNEM", "NOT"];
const mandatoryRows = activeEmployees.flatMap((employee, index) => ["Information Security", "Workplace Safety", "Ethics"].map((course, courseIndex) => { const completed = (index + courseIndex) % 11 !== 0; return [employee.id, employee.first, employee.last, completed ? "Completed" : "In Progress", completed ? 80 + ((index + courseIndex) % 20) : null, new Date(Date.UTC(2026, 0, 10)), completed ? new Date(Date.UTC(2026, 1 + courseIndex, 10)) : null, completed ? "Successful" : "Pending", 50 + courseIndex * 15, course, employee.store.name, employee.department, employee.title, employee.title, employee.store.region, employee.store.brand, employee.store.name, employee.id, new Date(Date.UTC(2026, 0, 11)), completed ? 100 : 40, new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 11, 31)), 50 + courseIndex * 15, 10, 8, 1.1, 30, 60, completed ? 20 : 120, new Date(Date.UTC(2026, courseIndex, 1)), "Synthetic mandatory learning"] }));
manifest.push(await writeWorkbook("zorunlu_egitim.xlsx", [{ name: "Sayfa1", headers: mandatoryHeaders, rows: mandatoryRows }]));

const examRows = activeEmployees.flatMap((employee, index) => ["Product Knowledge", "Customer Experience", "Operations"].map((exam, examIndex) => [employee.id, employee.first, employee.last, 65 + ((index * 7 + examIndex * 11) % 36), exam]));
manifest.push(await writeWorkbook("sinav_puanlari.xlsx", [{ name: "Sayfa1", headers: ["Kullanıcı Kodu", "Adı", "Soyadı", "Puanı", "Sınav"], rows: examRows }]));

const goalHeaders = ["Gösterge Adı", "Ölçüm Birimi", "Ölçüm Yönü", "Ağırlık", "%80-2026 Eşik Hedef", "2026 Hedef", "%120-2026 Max Hedef", "2026 Gerçekleşen\n(1 Ocak-31 Mart)", "2026 Gerçekleşen\n(1 Ocak-30 Haziran)", "2026 Gerçekleşen\n(1 Ocak-30 Eylül)", "2026 Gerçekleşen\n(1 Ocak-31 Aralık)", "Hedef Gerçekleşme Oranı"];
const makeGoals = (prefix, count) => Array.from({ length: count }, (_, index) => { const lowerBetter = index % 4 === 0; const target = lowerBetter ? 12 + index : 80 + index * 2; return [`${prefix} Synthetic Goal ${String(index + 1).padStart(2, "0")}`, lowerBetter ? "%" : "Index", lowerBetter ? "Decrease" : "Increase", 1 / count, lowerBetter ? target * 1.2 : target * 0.8, target, lowerBetter ? target * 0.8 : target * 1.2, lowerBetter ? target * 1.1 : target * 0.86, lowerBetter ? target * 0.95 : target * 0.94, lowerBetter ? target * 0.86 : target * 1.02, lowerBetter ? target * 0.82 : target * 1.08, null]; });
manifest.push(await writeWorkbook("2026_hedefler.xlsx", [{ name: "Ceo Hedefleri", headers: goalHeaders, rows: makeGoals("CEO", 12) }, { name: "Şirket Hedefleri", headers: goalHeaders, rows: makeGoals("Company", 18) }]));

const pdksHeaders = ["Sicil No", "adi", "soyadi", "departmanadi", "bolum_adi", "pozisyon_adi", "giris_tarihi", "giris_saati", "giris_nedeni", "giris_kapisi", "cikis_tarihi", "cikis_saati", "cikis_nedeni", "cikis_kapi", "calisma_saat_toplam", "gece", "gun_saat", "trh", "mola", "calisma_net_saat_toplam", "gun_saat_net", "olmasi_gereken", "fark", "evdenlik"];
const pdksRows = [];
for (const employee of activeEmployees.filter((person) => person.corporate)) {
  for (let month = 0; month < 8; month += 1) {
    for (let workDay = 1; workDay <= 22; workDay += 1) {
      const date = new Date(Date.UTC(2026, month, workDay));
      if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
      const actual = 8.2 + seeded(Number(employee.id.slice(3)), month * 31 + workDay) * 1.8;
      const remote = workDay % 9 === 0 ? "Evden" : workDay % 17 === 0 ? "Harici Evden" : "Ofis";
      pdksRows.push([employee.id, employee.first, employee.last, `Genel Müdürlük-${employee.department}`, employee.section, employee.title, date, 8 / 24, "Normal", "Main Gate", date, (17.5 / 24), "Normal", "Main Gate", actual / 24, 0, actual, date, 0.75 / 24, (actual - 0.75) / 24, actual - 0.75, 9.75, actual - 9.75, remote]);
    }
  }
}
manifest.push(await writeWorkbook("1-11 pdks.xlsx", [{ name: "PDKS", headers: pdksHeaders, rows: pdksRows }, { name: "Sayfa1", headers: ["Synthetic Note"], rows: [["This workbook contains only generated data."]] }, { name: "mola", headers: ["Sicil No", "Mola"], rows: activeEmployees.filter((employee) => employee.corporate).map((employee) => [employee.id, 0.75]) }]));

await fs.writeFile(path.join(outputDir, "synthetic-workbooks-manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), syntheticOnly: true, workbookCount: manifest.length, workbooks: manifest }, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ outputDir, workbookCount: manifest.length, workbooks: manifest }, null, 2));
