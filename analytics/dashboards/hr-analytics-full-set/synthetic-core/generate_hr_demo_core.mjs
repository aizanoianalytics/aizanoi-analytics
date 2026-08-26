import fs from 'node:fs/promises';
import path from 'node:path';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const outputPath = path.resolve(process.argv[2] || 'outputs/hr-analytics-full-set/hr_demo_core_synthetic.xlsx');
const workbook = Workbook.create();
const seedState = { value: 20260826 };
const regions = ['North', 'South', 'East', 'West', 'Central', 'International'];
const cities = ['Aurelia', 'Borealis', 'Cyrene', 'Dorian', 'Ephesus', 'Florentia', 'Gordium', 'Helios'];
const departments = ['Store Operations', 'Sales', 'Visual Merchandising', 'Logistics', 'Finance', 'People & Culture', 'Technology', 'Marketing', 'Customer Experience'];
const titles = ['Sales Associate', 'Senior Sales Associate', 'Store Specialist', 'Assistant Store Manager', 'Store Manager', 'Regional Manager', 'Analyst', 'Senior Analyst', 'Specialist', 'Manager'];
const exitReasons = ['Career change', 'Relocation', 'Education', 'Role fit', 'Personal reasons', 'Retirement', 'Contract completed'];
const learningPrograms = ['Customer Experience', 'Safety Essentials', 'Leadership Foundations', 'Product Knowledge', 'Data Literacy', 'Visual Excellence'];
const goalCategories = ['People', 'Customer', 'Operations', 'Growth', 'Learning'];
const months = monthSequence(new Date(Date.UTC(2019, 0, 1)), new Date(Date.UTC(2026, 7, 1)));

function random() {
  seedState.value = (1664525 * seedState.value + 1013904223) >>> 0;
  return seedState.value / 4294967296;
}

function integer(min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pick(values) {
  return values[integer(0, values.length - 1)];
}

function iso(date) {
  return date.toISOString().slice(0, 10);
}

function monthKey(date) {
  return date.toISOString().slice(0, 7);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function addMonths(date, value) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + value, 1));
}

function monthSequence(start, end) {
  const values = [];
  for (let cursor = new Date(start); cursor <= end; cursor = addMonths(cursor, 1)) values.push(new Date(cursor));
  return values;
}

function monthEnd(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function weekdays(start, end) {
  const values = [];
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) values.push(new Date(cursor));
  }
  return values;
}

function writeSheet(name, headers, rows, tableName, widths = {}) {
  const sheet = workbook.worksheets.getItem(name);
  sheet.showGridLines = false;
  const typedRows = rows.map((row) => row.map((value, index) => /(^Date$|_Date$)/.test(headers[index]) && typeof value === 'string' ? new Date(`${value}T00:00:00Z`) : value));
  const matrix = [headers, ...typedRows];
  sheet.getRangeByIndexes(0, 0, matrix.length, headers.length).values = matrix;
  sheet.getRangeByIndexes(0, 0, 1, headers.length).format = {
    fill: '#123342',
    font: { bold: true, color: '#FFFFFF' },
    rowHeight: 26,
  };
  sheet.getRangeByIndexes(1, 0, Math.max(rows.length, 1), headers.length).format = {
    font: { color: '#15242B' },
    rowHeight: 20,
  };
  for (let index = 0; index < headers.length; index += 1) {
    const defaultWidth = /_ID$/.test(headers[index]) ? 22 : Math.min(Math.max(headers[index].length + 3, 12), 24);
    sheet.getRangeByIndexes(0, index, matrix.length, 1).format.columnWidth = widths[headers[index]] || defaultWidth;
    if (/(^Date$|_Date$)/.test(headers[index]) && rows.length) sheet.getRangeByIndexes(1, index, rows.length, 1).format.numberFormat = 'yyyy-mm-dd';
    if (/(Rate|Attainment|Progress_Percent)$/.test(headers[index]) && rows.length) sheet.getRangeByIndexes(1, index, rows.length, 1).format.numberFormat = '0.0%';
    if (/(_Months|_Days|_Hours)$/.test(headers[index]) && rows.length) sheet.getRangeByIndexes(1, index, rows.length, 1).format.numberFormat = '#,##0.0';
  }
  if (rows.length) {
    const table = sheet.tables.add(sheet.getRangeByIndexes(0, 0, matrix.length, headers.length), true, tableName);
    table.style = 'TableStyleMedium2';
    table.showBandedRows = true;
    table.showFilterButton = true;
  }
  sheet.freezePanes.freezeRows(1);
  return sheet;
}

const stores = Array.from({ length: 24 }, (_, index) => {
  const region = regions[index % regions.length];
  return {
    storeId: `SYN-ST-${String(index + 1).padStart(3, '0')}`,
    storeName: `Synthetic Store ${String(index + 1).padStart(2, '0')}`,
    region,
    city: cities[index % cities.length],
    format: index % 5 === 0 ? 'Flagship' : index % 3 === 0 ? 'Outlet' : 'Standard',
    openingDate: iso(new Date(Date.UTC(2016 + (index % 8), index % 12, 1))),
  };
});

const employees = [];
for (let index = 1; index <= 480; index += 1) {
  const store = stores[(index * 7) % stores.length];
  const startDate = new Date(Date.UTC(2019 + (index % 7), index % 12, 1 + (index % 20)));
  const exited = index % 4 === 0 && startDate < new Date(Date.UTC(2026, 5, 1));
  const exitDate = exited ? addDays(startDate, 240 + integer(120, 1500)) : null;
  const boundedExit = exitDate && exitDate > new Date(Date.UTC(2026, 7, 20)) ? new Date(Date.UTC(2026, 6, 1 + (index % 20))) : exitDate;
  const department = index <= 360 ? departments[index % 4] : departments[4 + (index % 5)];
  const title = titles[index % titles.length];
  employees.push({
    employeeId: `SYN-EMP-${String(index).padStart(6, '0')}`,
    displayName: `Synthetic Employee ${String(index).padStart(4, '0')}`,
    gender: index % 2 === 0 ? 'Woman' : 'Man',
    birthYear: 1965 + (index % 37),
    startDate,
    exitDate: boundedExit,
    status: boundedExit ? 'Exited' : 'Active',
    contractType: index % 5 === 0 ? 'Part-Time' : 'Full-Time',
    department,
    region: store.region,
    city: store.city,
    storeId: department === 'Store Operations' || department === 'Sales' || department === 'Visual Merchandising' ? store.storeId : 'SYN-HQ-001',
    title,
    managerId: index <= 24 ? 'SYN-EXEC-001' : `SYN-EMP-${String(((index - 1) % 24) + 1).padStart(6, '0')}`,
    salaryBand: `B${1 + (index % 6)}`,
  });
}

const employmentMonthly = [];
for (const month of months) {
  const end = monthEnd(month);
  for (const employee of employees) {
    if (employee.startDate <= end && (!employee.exitDate || employee.exitDate >= month)) {
      employmentMonthly.push([
        monthKey(month), employee.employeeId, employee.status === 'Exited' && employee.exitDate <= end ? 'Exited' : 'Active', employee.department,
        employee.region, employee.city, employee.storeId, employee.title, employee.contractType, Math.max(0, (end - employee.startDate) / 86400000 / 30.4375),
      ]);
    }
  }
}

const exits = employees.filter((employee) => employee.exitDate).map((employee, index) => [
  `SYN-EXIT-${String(index + 1).padStart(5, '0')}`, employee.employeeId, iso(employee.exitDate), exitReasons[index % exitReasons.length],
  index % 3 === 0 ? 'Voluntary' : 'Other', index % 5 === 0 ? 'Regrettable' : 'Non-regrettable', employee.department, employee.title,
  employee.storeId, employee.region, employee.city, employee.contractType, Math.round((employee.exitDate - employee.startDate) / 86400000),
]);

const hiring = employees.map((employee, index) => [
  `SYN-HIRE-${String(index + 1).padStart(5, '0')}`, employee.employeeId, iso(addDays(employee.startDate, -integer(14, 70))), iso(employee.startDate),
  14 + (index % 43), index % 4 === 0 ? 'Referral' : index % 4 === 1 ? 'Career Site' : index % 4 === 2 ? 'Social' : 'Agency',
  employee.department, employee.title, employee.storeId, employee.region, index % 7 === 0 ? 'Backfill' : 'Growth',
]);

const promotions = employees.filter((_, index) => index % 6 === 0).map((employee, index) => {
  const candidateDate = addDays(employee.startDate, 365 + integer(60, 700));
  const asOfDate = new Date(Date.UTC(2026, 7, 20));
  const promotionDate = candidateDate > asOfDate ? new Date(Date.UTC(2026, 5, 1 + (index % 20))) : candidateDate;
  return [`SYN-PROM-${String(index + 1).padStart(5, '0')}`, employee.employeeId, iso(promotionDate), titles[Math.max(0, titles.indexOf(employee.title) - 1)], employee.title, employee.department, employee.storeId, employee.region];
});

const performance = [];
const quarters = ['2024-Q1', '2024-Q2', '2024-Q3', '2024-Q4', '2025-Q1', '2025-Q2', '2025-Q3', '2025-Q4', '2026-Q1', '2026-Q2'];
for (const employee of employees) {
  for (let q = 0; q < quarters.length; q += 1) {
    const score = Math.min(100, Math.max(45, 62 + ((employee.employeeId.charCodeAt(10) + q * 7 + integer(-8, 12)) % 37)));
    performance.push([quarters[q], employee.employeeId, employee.department, employee.storeId, employee.region, score, score >= 85 ? 'A' : score >= 75 ? 'B' : score >= 65 ? 'C' : 'D', (70 + ((employee.employeeId.length + q * 11) % 31)) / 100, 1 + (q % 5)]);
  }
}

const learning = [];
const exams = [];
const development = [];
const discipline = [];
const compliance = [];
for (let e = 0; e < employees.length; e += 1) {
  const employee = employees[e];
  for (let event = 0; event < 5; event += 1) {
    const eventDate = new Date(Date.UTC(2024 + ((e + event) % 3), (e * 3 + event * 2) % 8, 1 + ((e + event * 5) % 25)));
    const completion = 65 + ((e * 7 + event * 9) % 36);
    learning.push([`SYN-LRN-${String(learning.length + 1).padStart(6, '0')}`, employee.employeeId, iso(eventDate), learningPrograms[(e + event) % learningPrograms.length], event % 2 === 0 ? 'Digital' : 'Classroom', completion, completion >= 70 ? 'Completed' : 'Incomplete', 1 + (event % 4), employee.storeId, employee.region]);
  }
  for (let exam = 0; exam < 2; exam += 1) {
    const score = 55 + ((e * 11 + exam * 17) % 46);
    exams.push([`SYN-EXAM-${String(exams.length + 1).padStart(6, '0')}`, employee.employeeId, `Assessment ${exam + 1}`, `2026-0${2 + exam}-15`, score, score >= 70 ? 'Passed' : 'Needs Support', employee.storeId, employee.region]);
  }
  if (e % 3 === 0) development.push([`SYN-DEV-${String(development.length + 1).padStart(5, '0')}`, employee.employeeId, 'Leadership Path', '2025-09-01', e % 2 === 0 ? 'In Progress' : 'Completed', (30 + (e % 71)) / 100, employee.title, employee.storeId, employee.region]);
  if (e % 11 === 0) discipline.push([`SYN-DIS-${String(discipline.length + 1).padStart(5, '0')}`, employee.employeeId, `2026-0${1 + (e % 7)}-10`, e % 2 === 0 ? 'Attendance coaching' : 'Process coaching', e % 3 === 0 ? 'Open' : 'Closed', employee.storeId, employee.region]);
  compliance.push([employee.employeeId, employee.storeId, employee.region, 70 + (e % 31), 65 + ((e * 3) % 36), 68 + ((e * 5) % 33), e % 9 === 0 ? 'At Risk' : e % 4 === 0 ? 'Watch' : 'On Track']);
}

const storeScorecards = [];
for (const month of months) {
  for (let index = 0; index < stores.length; index += 1) {
    const store = stores[index];
    const workforce = employmentMonthly.filter((row) => row[0] === monthKey(month) && row[6] === store.storeId).length;
    const openingDate = new Date(`${store.openingDate}T00:00:00Z`);
    if (month < openingDate || workforce === 0) continue;
    storeScorecards.push([monthKey(month), store.storeId, store.storeName, store.region, store.city, workforce, 82 + ((index * 3 + month.getUTCMonth()) % 19), 76 + ((index * 7 + month.getUTCMonth()) % 25), 72 + ((index * 5 + month.getUTCMonth()) % 29), 500000 + index * 22000 + month.getUTCMonth() * 17000]);
  }
}

const goals = [];
for (let category = 0; category < goalCategories.length; category += 1) {
  for (let metric = 1; metric <= 4; metric += 1) {
    const target = category === 3 ? 25000000 : 100;
    const direction = metric % 2 === 0 ? 'Higher is better' : 'Lower is better';
    const factor = 0.72 + ((category * 4 + metric) % 7) * 0.045;
    const actual = direction === 'Higher is better' ? target * factor : target * (2 - factor);
    const attainment = direction === 'Higher is better' ? actual / target : target / actual;
    goals.push([`SYN-GOAL-${String(goals.length + 1).padStart(3, '0')}`, goalCategories[category], `${goalCategories[category]} Metric ${metric}`, '2026', target, Math.round(actual * 100) / 100, attainment, attainment >= 1 ? 'Achieved' : attainment >= 0.85 ? 'On Track' : 'Needs Attention', direction]);
  }
}

const attendance = [];
const attendanceDays = weekdays(new Date(Date.UTC(2026, 5, 1)), new Date(Date.UTC(2026, 7, 20)));
for (const day of attendanceDays) {
  for (const employee of employees) {
    if (employee.startDate > day || (employee.exitDate && employee.exitDate < day)) continue;
    const scheduled = employee.contractType === 'Part-Time' ? 5 : 8;
    const absence = (day.getUTCDate() + Number(employee.employeeId.slice(-3))) % 47 === 0;
    const worked = absence ? 0 : Math.max(3, scheduled + ((day.getUTCDate() + Number(employee.employeeId.slice(-2))) % 5 - 2) * 0.5);
    attendance.push([iso(day), employee.employeeId, employee.department, employee.storeId, employee.region, scheduled, worked, worked - scheduled, absence ? 'Absent' : worked < scheduled ? 'Short' : worked > scheduled ? 'Overtime' : 'Complete']);
  }
}

const turnoverAnalysis = [];
for (const month of months) {
  for (const region of ['All', ...regions]) {
    const regionEmployees = employees.filter((employee) => region === 'All' || employee.region === region);
    const start = regionEmployees.filter((employee) => employee.startDate < month && (!employee.exitDate || employee.exitDate >= month)).length;
    const endDate = monthEnd(month);
    const end = regionEmployees.filter((employee) => employee.startDate <= endDate && (!employee.exitDate || employee.exitDate > endDate)).length;
    const hires = regionEmployees.filter((employee) => monthKey(employee.startDate) === monthKey(month)).length;
    const monthExits = regionEmployees.filter((employee) => employee.exitDate && monthKey(employee.exitDate) === monthKey(month)).length;
    const average = (start + end) / 2;
    turnoverAnalysis.push([monthKey(month), region, start, hires, monthExits, end, average, average ? monthExits / average : 0]);
  }
}

const sheetOrder = ['Overview', 'Settings', 'Organization', 'Employees', 'Employment_Monthly', 'Exits', 'Hiring', 'Promotions', 'Performance', 'Learning_Events', 'Exams', 'Development', 'Discipline', 'Compliance', 'Store_Scorecards', 'Goals', 'Attendance', 'Turnover_Analysis', 'QA_Control', 'Data_Dictionary'];
for (const sheetName of sheetOrder) workbook.worksheets.add(sheetName);
const overview = workbook.worksheets.getItem('Overview');
overview.showGridLines = false;
overview.getRange('A1:H1').merge();
overview.getRange('A1').values = [['HR Analytics Full Set · Synthetic HR Demo Core']];
overview.getRange('A1:H1').format = { fill: '#081016', font: { bold: true, color: '#74E0BD', size: 20 }, rowHeight: 42 };
overview.getRange('A2:H2').merge();
overview.getRange('A2').values = [['Deterministic fictional workforce data. No employer or real-person records.']];
overview.getRange('A2:H2').format = { fill: '#081016', font: { color: '#D6E1E5', italic: true }, rowHeight: 28 };
overview.getRange('A3:H4').format = { fill: '#EAF7F2', font: { color: '#123342' }, borders: { preset: 'outside', style: 'thin', color: '#74E0BD' } };
overview.getRange('A3:H3').values = [['Employees', null, 'Active', null, 'Exits', null, 'Learning events', null]];
overview.getRange('A4').formulas = [[`=COUNTA('Employees'!$A$2:$A$${employees.length + 1})`]];
overview.getRange('C4').formulas = [[`=COUNTIF('Employees'!$G$2:$G$${employees.length + 1},"Active")`]];
overview.getRange('E4').formulas = [[`=COUNTA('Exits'!$A$2:$A$${exits.length + 1})`]];
overview.getRange('G4').formulas = [[`=COUNTA('Learning_Events'!$A$2:$A$${learning.length + 1})`]];
overview.getRange('A3:H3').format.font = { bold: true, color: '#315D6B' };
overview.getRange('A4:H4').format.font = { bold: true, color: '#123342', size: 18 };
overview.getRange('A7:C7').values = [['Region', 'Active Headcount', 'Exits']];
overview.getRange('A7:C7').format = { fill: '#123342', font: { bold: true, color: '#FFFFFF' } };
overview.getRange('A8:A13').values = regions.map((region) => [region]);
for (let index = 0; index < regions.length; index += 1) {
  const row = index + 8;
  overview.getRange(`B${row}`).formulas = [[`=COUNTIFS('Employees'!$G$2:$G$${employees.length + 1},"Active",'Employees'!$J$2:$J$${employees.length + 1},A${row})`]];
  overview.getRange(`C${row}`).formulas = [[`=COUNTIF('Exits'!$J$2:$J$${exits.length + 1},A${row})`]];
}
overview.getRange('A1:H14').format.columnWidth = 16;
overview.getRange('A1:A14').format.columnWidth = 20;
const headcountChart = overview.charts.add('bar', overview.getRange('A7:B13'));
headcountChart.title = 'Active Headcount by Region';
headcountChart.hasLegend = false;
headcountChart.setPosition('E7', 'L20');
headcountChart.xAxis = { axisType: 'textAxis' };
headcountChart.yAxis = { numberFormatCode: '#,##0' };
overview.freezePanes.freezeRows(2);

writeSheet('Settings', ['Key', 'Value', 'Description'], [
  ['schema_version', '1.0.0', 'Public synthetic core schema'], ['seed', 20260826, 'Deterministic generation seed'],
  ['as_of_date', '2026-08-20', 'Latest synthetic operational date'], ['data_policy', 'synthetic-only', 'No anonymized or transformed employer data'],
  ['employee_count', employees.length, 'Generated employee identities'], ['store_count', stores.length, 'Generated store locations'],
], 'SettingsTable', { Key: 22, Value: 20, Description: 44 });
writeSheet('Organization', ['Store_ID', 'Store_Name', 'Region', 'City', 'Format', 'Opening_Date'], stores.map((store) => Object.values(store)), 'OrganizationTable', { Store_Name: 22 });
const employeeSheet = writeSheet('Employees', ['Employee_ID', 'Display_Name', 'Gender', 'Birth_Year', 'Start_Date', 'Exit_Date', 'Status', 'Contract_Type', 'Department', 'Region', 'City', 'Store_ID', 'Title', 'Manager_ID', 'Salary_Band'], employees.map((employee) => [employee.employeeId, employee.displayName, employee.gender, employee.birthYear, iso(employee.startDate), employee.exitDate ? iso(employee.exitDate) : null, employee.status, employee.contractType, employee.department, employee.region, employee.city, employee.storeId, employee.title, employee.managerId, employee.salaryBand]), 'EmployeesTable', { Display_Name: 24, Department: 24, Title: 24 });
employeeSheet.getRange(`D2:D${employees.length + 1}`).format.numberFormat = '0';
writeSheet('Employment_Monthly', ['Month', 'Employee_ID', 'Month_End_Status', 'Department', 'Region', 'City', 'Store_ID', 'Title', 'Contract_Type', 'Tenure_Months'], employmentMonthly, 'EmploymentMonthlyTable', { Department: 24, Title: 24 });
writeSheet('Exits', ['Exit_ID', 'Employee_ID', 'Exit_Date', 'Reason', 'Exit_Type', 'Regrettable_Status', 'Department', 'Title', 'Store_ID', 'Region', 'City', 'Contract_Type', 'Tenure_Days'], exits, 'ExitsTable', { Reason: 22, Regrettable_Status: 20, Department: 24, Title: 24 });
writeSheet('Hiring', ['Hiring_ID', 'Employee_ID', 'Application_Date', 'Start_Date', 'Time_to_Hire_Days', 'Source', 'Department', 'Title', 'Store_ID', 'Region', 'Hiring_Type'], hiring, 'HiringTable', { Department: 24, Title: 24 });
writeSheet('Promotions', ['Promotion_ID', 'Employee_ID', 'Promotion_Date', 'From_Title', 'To_Title', 'Department', 'Store_ID', 'Region'], promotions, 'PromotionsTable', { From_Title: 24, To_Title: 24, Department: 24 });
writeSheet('Performance', ['Quarter', 'Employee_ID', 'Department', 'Store_ID', 'Region', 'Performance_Score', 'Grade', 'Target_Attainment', 'Potential_Level'], performance, 'PerformanceTable', { Department: 24 });
writeSheet('Learning_Events', ['Event_ID', 'Employee_ID', 'Event_Date', 'Program', 'Delivery_Mode', 'Score', 'Completion_Status', 'Hours', 'Store_ID', 'Region'], learning, 'LearningEventsTable', { Program: 24, Completion_Status: 20 });
writeSheet('Exams', ['Exam_ID', 'Employee_ID', 'Exam_Name', 'Exam_Date', 'Score', 'Result', 'Store_ID', 'Region'], exams, 'ExamsTable', { Exam_Name: 20, Result: 18 });
writeSheet('Development', ['Journey_ID', 'Employee_ID', 'Program', 'Start_Date', 'Status', 'Progress_Percent', 'Current_Title', 'Store_ID', 'Region'], development, 'DevelopmentTable', { Program: 22, Current_Title: 24 });
writeSheet('Discipline', ['Case_ID', 'Employee_ID', 'Case_Date', 'Category', 'Status', 'Store_ID', 'Region'], discipline, 'DisciplineTable', { Category: 24 });
writeSheet('Compliance', ['Employee_ID', 'Store_ID', 'Region', 'Mandatory_Learning_Score', 'Safety_Score', 'Checklist_Score', 'Risk_Band'], compliance, 'ComplianceTable', { Mandatory_Learning_Score: 24 });
writeSheet('Store_Scorecards', ['Month', 'Store_ID', 'Store_Name', 'Region', 'City', 'Headcount', 'Performance_Score', 'Learning_Score', 'Compliance_Score', 'Revenue_Index'], storeScorecards, 'StoreScorecardsTable', { Store_Name: 22 });
writeSheet('Goals', ['Goal_ID', 'Category', 'Metric', 'Period', 'Target', 'Actual', 'Attainment', 'Status', 'Direction'], goals, 'GoalsTable', { Category: 16, Metric: 24, Status: 18, Direction: 20 });
writeSheet('Attendance', ['Date', 'Employee_ID', 'Department', 'Store_ID', 'Region', 'Scheduled_Hours', 'Worked_Hours', 'Variance_Hours', 'Status'], attendance, 'AttendanceTable', { Department: 24 });
writeSheet('Turnover_Analysis', ['Month', 'Region', 'Opening_Headcount', 'Hires', 'Exits', 'Closing_Headcount', 'Average_Headcount', 'Turnover_Rate'], turnoverAnalysis, 'TurnoverAnalysisTable');

const qaRows = [
  ['Employee IDs populated', `=COUNTA('Employees'!$A$2:$A$${employees.length + 1})`, employees.length, `=IF(B2=C2,"PASS","FAIL")`],
  ['Synthetic employee identity rows', `=COUNTA('Employees'!$A$2:$A$${employees.length + 1})`, employees.length, `=IF(B3=C3,"PASS","FAIL")`],
  ['Exit rows reconcile', `=COUNTA('Exits'!$A$2:$A$${exits.length + 1})`, exits.length, `=IF(B4=C4,"PASS","FAIL")`],
  ['Learning rows reconcile', `=COUNTA('Learning_Events'!$A$2:$A$${learning.length + 1})`, learning.length, `=IF(B5=C5,"PASS","FAIL")`],
  ['Attendance rows reconcile', `=COUNTA('Attendance'!$A$2:$A$${attendance.length + 1})`, attendance.length, `=IF(B6=C6,"PASS","FAIL")`],
  ['Store IDs populated', `=COUNTA('Organization'!$A$2:$A$${stores.length + 1})`, stores.length, `=IF(B7=C7,"PASS","FAIL")`],
];
const qa = workbook.worksheets.getItem('QA_Control');
qa.showGridLines = false;
qa.getRange('A1:D1').values = [['Control', 'Calculated', 'Expected', 'Status']];
qa.getRange('A2:A7').values = qaRows.map((row) => [row[0]]);
qa.getRange('B2:B7').formulas = qaRows.map((row) => [row[1]]);
qa.getRange('C2:C7').values = qaRows.map((row) => [row[2]]);
qa.getRange('D2:D7').formulas = qaRows.map((row) => [row[3]]);
qa.getRange('A1:D1').format = { fill: '#123342', font: { bold: true, color: '#FFFFFF' } };
qa.getRange('A1:D7').format.columnWidth = 24;
qa.getRange('A1:A7').format.columnWidth = 38;
qa.getRange('D2:D7').conditionalFormats.add('containsText', { text: 'PASS', format: { fill: '#DDF5E8', font: { bold: true, color: '#12613B' } } });
qa.getRange('D2:D7').conditionalFormats.add('containsText', { text: 'FAIL', format: { fill: '#FFE2E2', font: { bold: true, color: '#8B1E1E' } } });

const dictionaryRows = [
  ['Overview', 'Executive workbook summary and region chart'], ['Settings', 'Generation metadata and public data policy'],
  ['Organization', 'Fictional store and geography dimension'], ['Employees', 'Synthetic employee master'], ['Employment_Monthly', 'Employee-month workforce bridge'],
  ['Exits', 'Synthetic exit events and reasons'], ['Hiring', 'Synthetic recruitment funnel outcomes'], ['Promotions', 'Synthetic internal mobility events'],
  ['Performance', 'Quarterly performance and potential results'], ['Learning_Events', 'Training participation, score and completion'], ['Exams', 'Assessment outcomes'],
  ['Development', 'Development journey progress'], ['Discipline', 'Synthetic coaching and case records'], ['Compliance', 'Mandatory learning, safety and checklist scores'],
  ['Store_Scorecards', 'Monthly store workforce and operating indicators'], ['Goals', 'Strategic metric targets and attainment'], ['Attendance', 'Daily scheduled and worked-hour records'],
  ['Turnover_Analysis', 'Reconciled monthly headcount and turnover by region'], ['QA_Control', 'Formula-driven row and identity checks'], ['Data_Dictionary', 'Workbook sheet definitions'],
];
writeSheet('Data_Dictionary', ['Sheet', 'Purpose'], dictionaryRows, 'DataDictionaryTable', { Sheet: 24, Purpose: 68 });

for (const sheetName of ['Employees', 'Employment_Monthly', 'Exits', 'Hiring', 'Promotions', 'Learning_Events', 'Exams', 'Development', 'Discipline', 'Attendance']) {
  const sheet = workbook.worksheets.getItem(sheetName);
  const used = sheet.getUsedRange();
  used.format.wrapText = false;
}
workbook.comments.setSelf({ displayName: 'Aizanoi Analytics' });
workbook.comments.addThread({ cell: overview.getRange('A2') }, 'This workbook is generated from scratch. It is not anonymized, sampled, masked or transformed from an employer workbook.');
await fs.mkdir(path.dirname(outputPath), { recursive: true });
const previewDirectory = path.join(path.dirname(outputPath), 'qa-previews');
await fs.mkdir(previewDirectory, { recursive: true });
const previewRanges = {
  Overview: 'A1:L20', Settings: 'A1:C8', Organization: 'A1:F15', Employees: 'A1:O15', Employment_Monthly: 'A1:J15',
  Exits: 'A1:M15', Hiring: 'A1:K15', Promotions: 'A1:H15', Performance: 'A1:I15', Learning_Events: 'A1:J15', Exams: 'A1:H15',
  Development: 'A1:I15', Discipline: 'A1:G15', Compliance: 'A1:G15', Store_Scorecards: 'A1:J15', Goals: 'A1:I15',
  Attendance: 'A1:I15', Turnover_Analysis: 'A1:H15', QA_Control: 'A1:D8', Data_Dictionary: 'A1:B21',
};
for (const sheetName of sheetOrder) {
  const preview = await workbook.render({ sheetName, range: previewRanges[sheetName], scale: 1, format: 'png' });
  await fs.writeFile(path.join(previewDirectory, `${sheetName.toLowerCase()}.png`), new Uint8Array(await preview.arrayBuffer()));
}
const qaInspection = await workbook.inspect({ kind: 'table', sheetId: 'QA_Control', range: 'A1:D7', include: 'values,formulas', tableMaxRows: 8, tableMaxCols: 4, maxChars: 5000 });
const formulaErrors = await workbook.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A', options: { useRegex: true, maxResults: 100 }, summary: 'final formula error scan' });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(JSON.stringify({ outputPath, sheets: 20, employees: employees.length, exits: exits.length, attendanceRows: attendance.length, employmentMonthlyRows: employmentMonthly.length, qa: qaInspection.ndjson, formulaErrors: formulaErrors.ndjson }));
