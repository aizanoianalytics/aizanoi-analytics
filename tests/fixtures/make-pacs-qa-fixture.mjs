// Generate a tiny, fully synthetic PDKS workbook for the PACS Excel-loader test.
//
// It is NOT a copy of the 1.5 MB sample: every value here is invented for QA
// (names from a fixed synthetic list, a QA-only organization, QA dates). It
// exists to prove the browser import path actually parses a workbook and swaps
// the dashboard's dataset — not to validate data parity, which stays with the
// existing source/parity tests.
//
// Emitted as minimal SpreadsheetML so no test-only dependency is required:
// a .xlsx is a zip, and the dashboard only needs sheet1 + inline strings.
import { deflateRawSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

// QA-only, obviously synthetic values. Fixed, not random: the assertions below
// are exact and must stay deterministic across runs.
const ORG = 'QA Synthetic Department';
const COMPANY = 'QA SYNTHETIC CO.';
const PEOPLE = [
  ['9001', 'QA ALPHA PERSON', 'Analyst', 'Reporting Specialist'],
  ['9002', 'QA BETA PERSON', 'Analyst', 'Reporting Specialist'],
  ['9003', 'QA GAMMA PERSON', 'Coordinator', 'Shift Coordinator'],
];
const DATES = ['2026-09-01', '2026-09-02', '2026-09-03'];

// PACS matches headers with String#includes against ASCII-ish Turkish keys
// ("ilk giriş saati", "son çıkış saati"). JS leaves the dotted capital İ as
// "i" + U+0307 COMBINING DOT ABOVE, which does not match "i". Use the exact
// ASCII-compatible spellings the matcher recognises so the fixture exercises
// the real import path instead of silently losing the entry/exit columns.
const HEADERS = [
  'Pers.no.', 'Adı Soyadı', 'ŞK', 'Şirket Adı', 'Organizasyon Tanımı', 'Pozisyon', 'İş Tanımı',
  'Kart Okutma Tarihi', 'Kart Okutma Günü', 'Giriş Cıkış Durumu',
  'Ilk Giriş Tarihi', 'Ilk Giriş Saati', 'Son Çıkış Tarihi', 'Son Çıkış Saati',
];

// Excel serial date (1900 system) for the QA dates.
const serial = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) / 86400000) + 25569);
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday'];

const rows = [];
rows.push(HEADERS.map((h) => ({ v: h })));
PEOPLE.forEach(([no, name], pi) => {
  DATES.forEach((date, di) => {
    // Vary the status so the imported state is observably different per row.
    const status = di === 0 ? 'OK' : di === 1 ? 'NO_INPUT_OUTPUT' : 'NO_OUTPUT';
    const inTime = status === 'OK' ? '08:0' + pi : '';
    const outTime = status === 'OK' ? '17:' + (30 + di * 5) : '';
    rows.push([
      { v: no }, { v: name }, { v: '9000' }, { v: COMPANY }, { v: ORG },
 { v: PEOPLE[pi][2] }, { v: PEOPLE[pi][3] },
 // Real PDKS workbooks store the card date as a numeric Excel serial.
 // PACS only parses a number or a yyyy-mm-dd style string, so emit the
 // number; a quoted serial here would silently drop every row.
 { v: serial(date) }, { v: WEEKDAYS[di] }, { v: status },
      { v: inTime ? date : '' }, { v: inTime },
      { v: outTime ? date : '' }, { v: outTime },
    ]);
  });
});

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const sheetRows = rows
  .map((cells, ri) => {
    const cs = cells
      .map((c, ci) => {
        const ref = `${String.fromCharCode(65 + ci)}${ri + 1}`;
        if (c.v === '' || c.v == null) return '';
        if (typeof c.v === 'number') return `<c r="${ref}"><v>${c.v}</v></c>`;
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
      })
      .join('');
    return `<row r="${ri + 1}">${cs}</row>`;
  })
  .join('');
const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;

const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`;

const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

// --- minimal zip writer -----------------------------------------------------
// crc32 is not exported by node:zlib on every supported version, so implement
// the standard CRC-32 (IEEE 802.3) here rather than adding a dependency.
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function zip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const dosDate = 0; // fixed timestamp keeps the fixture byte-deterministic
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const raw = Buffer.from(data, 'utf8');
    const comp = deflateRawSync(raw, { level: 9 });
    const crc = crc32(raw);
    const localOffset = offset;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(dosDate, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    chunks.push(local, nameBuf, comp);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(dosDate, 12);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); // extra
    cd.writeUInt16LE(0, 32); // comment
    cd.writeUInt16LE(0, 34); // disk number
    cd.writeUInt16LE(0, 36); // internal attrs
    cd.writeUInt32LE(0, 38); // external attrs
    cd.writeUInt32LE(localOffset, 42); // relative offset of local header
    central.push(Buffer.concat([cd, nameBuf]));

    offset += local.length + nameBuf.length + comp.length;
  }
  const cdStart = offset;
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(cdStart, 16);
  return Buffer.concat([...chunks, cdBuf, end]);
}

const out = process.argv[2] || '/tmp/pacs-qa-fixture.xlsx';
writeFileSync(
  out,
  zip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
    { name: 'xl/worksheets/sheet1.xml', data: sheet },
  ]),
);
console.log(`wrote ${out}: ${PEOPLE.length} people x ${DATES.length} days = ${PEOPLE.length * DATES.length} attendance rows, org "${ORG}"`);
