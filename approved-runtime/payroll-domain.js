/** Offline build 862 business engine, bdcdf2dba16d09489da9d7ee7942a7eb5ab7f2a0.
 * Pure mobile adapter; no network, storage, UI or permission side effects.
 * Desktop payroll/calendar/validation code below is transpiled without semantic edits.
 */
import {sha256Hex as sha256} from './accounting-hash.js';
const randomUUID = () => globalThis.crypto.randomUUID();
const createHash = () => { let value = ''; return { update(input) { value += input; return this; }, digest() { return sha256(value); } }; };
const displayDocumentNumber = document => String(document.number ?? document.id);
export class PayrollError extends Error {
    status;
    blockers;
    constructor(message, status = 400, blockers = []) {
        super(message);
        this.status = status;
        this.blockers = blockers;
    }
}
const text = (value) => typeof value === "string" ? value.trim() : "";
const fail = (message, status = 400) => new PayrollError(message, status);
const id = (prefix) => `${prefix}-${randomUUID()}`;
const amount = (cents) => cents / 100;
function signedMoney(value) {
    if (typeof value !== "number" || !Number.isFinite(value))
        throw fail("رصيد العامل غير صالح");
    return Math.sign(value) * money(Math.abs(value), true);
}
export function employeePaymentDirection(document) {
    const value = document.employeePaymentDirection ?? "withdraw";
    if (value !== "withdraw" && value !== "deposit")
        throw fail("نوع حركة حساب العامل غير صالح");
    return value;
}
const accountSign = (document) => document.kind === "employee-accrual" || employeePaymentDirection(document) === "deposit" ? 1 : -1;
function money(value, allowZero = false) {
    if ((typeof value !== "number" && typeof value !== "string") || text(String(value)) === "" ||
        (typeof value === "string" && !/^\d+(?:\.\d{1,2})?$/.test(value.trim())))
        throw fail("المبلغ يجب أن يكون رقمًا صالحًا بخانتين عشريتين على الأكثر");
    const number = Number(value), cents = Math.round(number * 100);
    if (!Number.isFinite(number) || !Number.isSafeInteger(cents) || (allowZero ? cents < 0 : cents <= 0) || Math.abs(number * 100 - cents) > 1e-7)
        throw fail("المبلغ يجب أن يكون رقمًا موجبًا صالحًا");
    return cents;
}
function day(value) {
    const input = text(value), date = new Date(`${input}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input) || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== input || Number(input.slice(0, 4)) < 1900)
        throw fail("التاريخ غير صالح");
    return input;
}
const today = (now) => day(now.toISOString().slice(0, 10));
const iso = (date) => `${date}T12:00:00.000Z`;
function interval(value) {
    const months = Number(value ?? 1);
    if (!Number.isSafeInteger(months) || months < 1 || months > 12)
        throw fail("فترة الراتب يجب أن تكون بين شهر واحد و12 شهرًا");
    return months;
}
function timing(value) {
    if (value !== "beginning" && value !== "end")
        throw fail("اختر الاستحقاق في بداية الفترة أو نهايتها");
    return value;
}
function boundary(start, months, anchorDay) {
    const year = Number(start.slice(0, 4)), month = Number(start.slice(5, 7)) - 1;
    const target = new Date(Date.UTC(year, month + months, 1));
    const maximum = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(anchorDay, maximum));
    return target.toISOString().slice(0, 10);
}
const monthsBetween = (start, end) => (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(end.slice(5, 7)) - Number(start.slice(5, 7));
function shiftDay(value, days) {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}
const priorDay = (value) => shiftDay(value, -1);
const agreements = (employee) => employee.agreements.filter(row => !row.canceledAt).slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
function periods(employee, asOf) {
    const result = [], schedule = agreements(employee);
    for (const [index, agreement] of schedule.entries()) {
        if (agreement.startDate < employee.startDate)
            continue;
        const nextAgreement = schedule[index + 1]?.startDate;
        for (let startDate = agreement.startDate; startDate <= asOf && (!nextAgreement || startDate < nextAgreement);) {
            const next = boundary(startDate, agreement.intervalMonths, agreement.anchorDay), endDate = priorDay(next);
            const dueDate = agreement.entitlement === "beginning" ? startDate : endDate;
            if (dueDate > asOf || (agreement.stopDate && dueDate > agreement.stopDate))
                break;
            result.push({ startDate, endDate, dueDate, agreement });
            startDate = next;
        }
    }
    return result;
}
export function nextPayrollAgreementStart(employee, asOf) {
    const date = day(asOf), schedule = agreements(employee);
    const agreement = schedule.filter(row => row.startDate <= date).at(-1) ?? schedule[0];
    if (!agreement)
        throw fail("اتفاق الراتب غير موجود", 409);
    if (agreement.startDate > date)
        return agreement.startDate;
    let next = agreement.startDate;
    while (next <= date)
        next = boundary(next, agreement.intervalMonths, agreement.anchorDay);
    return next;
}
const accrualId = (employeeId, periodStart) => `employee-accrual-${createHash("sha256").update(JSON.stringify([employeeId, periodStart])).digest("hex").slice(0, 32)}`;
function checkRevision(row, input) {
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== Number(row.revision ?? 0))
        throw fail("تغير السجل. حدّث الصفحة وأعد المحاولة", 409);
}
function reason(input) {
    const value = text(input.reason);
    if (!value || value.length > 1000)
        throw fail("سبب التعديل أو الإلغاء مطلوب");
    return value;
}
async function atomic(db, session, work) {
    if (!db.native.inTransaction)
        return db.transaction(work);
    const point = `payroll_${randomUUID().replaceAll("-", "")}`;
    db.native.exec(`SAVEPOINT ${point}`);
    try {
        const result = await work(session);
        db.native.exec(`RELEASE SAVEPOINT ${point}`);
        return result;
    }
    catch (error) {
        db.native.exec(`ROLLBACK TO SAVEPOINT ${point}`);
        db.native.exec(`RELEASE SAVEPOINT ${point}`);
        throw error;
    }
}
async function audit(db, action, before, after, now) {
    await db.collection("auditEvents").insertOne({ id: id("payroll-audit"), action: `payroll.${action}`, status: "committed", entityId: after.id, employeeId: after.employeeId ?? after.id, createdAt: now.toISOString(), before, after });
}
async function employeeById(db, value) {
    const employee = await db.collection("employees").findOne({ id: text(value) });
    if (!employee || !Array.isArray(employee.agreements) || !employee.agreements.length)
        throw fail("الموظف غير موجود أو اتفاقه غير صالح", 404);
    return employee;
}
async function changeBalance(db, employee, delta, now) {
    const before = signedMoney(employee.balance), after = before + delta;
    if (!Number.isSafeInteger(after))
        throw fail("رصيد العامل غير صالح", 409);
    const changed = await db.collection("employees").updateOne({ id: employee.id, balance: employee.balance }, { $set: { balance: amount(after), updatedAt: now.toISOString() } });
    if (!changed.matchedCount)
        throw fail("تغير رصيد الموظف. حدّث الصفحة وأعد المحاولة", 409);
    employee.balance = amount(after);
}
async function state(db, employee) {
    const documents = await db.collection("documents").find({ employeeId: employee.id, kind: { $in: ["employee-accrual", "employee-payment"] } }).toArray();
    const accruals = documents.filter(row => row.kind === "employee-accrual"), allocated = new Map();
    for (const payment of documents.filter(row => row.kind === "employee-payment" && row.status === "posted")) {
        if (!Array.isArray(payment.allocations))
            throw fail("روابط دفعة الموظف غير صالحة", 409);
        if (payment.employeePaymentVersion === 2) {
            if (payment.allocations.length)
                throw fail("روابط حركة حساب العامل غير صالحة", 409);
            continue;
        }
        let paid = 0;
        for (const allocation of payment.allocations) {
            const cents = money(allocation.amount), source = accruals.find(row => row.id === allocation.accrualId && row.status === "posted");
            if (!source || String(source.dueDate) > String(payment.businessDate))
                throw fail("دفعة الموظف تشير إلى استحقاق غير صالح", 409);
            allocated.set(source.id, (allocated.get(source.id) ?? 0) + cents);
            paid += cents;
        }
        if (paid !== money(payment.total))
            throw fail("مجموع توزيع دفعة الموظف غير مطابق", 409);
    }
    let balance = 0;
    let previousEnd = "";
    for (const accrual of accruals.filter(row => row.status === "posted").sort((a, b) => String(a.periodStart).localeCompare(String(b.periodStart)))) {
        const start = day(accrual.periodStart), end = day(accrual.periodEnd);
        if (end < start || (previousEnd && start <= previousEnd))
            throw fail("فترات استحقاق الموظف متداخلة", 409);
        previousEnd = end;
    }
    for (const accrual of accruals) {
        if (accrual.id !== accrualId(employee.id, String(accrual.periodStart)))
            throw fail("معرف استحقاق الموظف غير صالح", 409);
        if (accrual.status !== "posted")
            continue;
        const remaining = money(accrual.total) - (allocated.get(accrual.id) ?? 0);
        if (remaining < 0)
            throw fail("دفعات الموظف تتجاوز الاستحقاق", 409);
        balance += money(accrual.total);
    }
    for (const payment of documents.filter(row => row.kind === "employee-payment" && row.status === "posted")) {
        balance += accountSign(payment) * money(payment.total);
    }
    if (balance !== signedMoney(employee.balance))
        throw fail("رصيد الموظف لا يطابق سجل استحقاقاته ودفعاته", 409);
    return { documents, accruals, allocated };
}
async function accrueEmployee(db, employee, asOf, now, context) {
    const saved = await state(db, employee), byId = new Map(saved.accruals.map(row => [row.id, row]));
    let created = 0, totalAccrued = 0;
    for (const period of periods(employee, asOf)) {
        const documentId = accrualId(employee.id, period.startDate), existing = byId.get(documentId);
        if (existing)
            continue;
        const cents = money(period.agreement.amount);
        const document = { id: documentId, number: `EMP-${period.startDate}-${documentId.slice("employee-accrual-".length)}`, kind: "employee-accrual", status: "posted", revision: 0,
            employeeId: employee.id, employeeName: employee.name, periodStart: period.startDate, periodEnd: period.endDate, dueDate: period.dueDate,
            businessDate: period.dueDate, occurredAt: iso(period.dueDate), total: amount(cents), amount: amount(cents), balanceDelta: amount(cents),
            agreementSnapshot: structuredClone(period.agreement), lines: [], createdAt: now.toISOString(), context };
        await db.collection("documents").insertOne(document);
        await changeBalance(db, employee, cents, now);
        await audit(db, "employee-accrual.automatic", null, document, now);
        byId.set(documentId, document);
        created++;
        totalAccrued += cents;
    }
    return { created, totalAccrued };
}
/** Call during bootstrap/restore in the same transaction, using local business day. */
export async function accrueDueEmployees(db, session, options = {}) {
    const now = options.now ?? new Date(), asOf = day(options.asOf ?? today(now));
    if (asOf > today(now))
        throw fail("لا يمكن اعتماد استحقاق قبل حلول تاريخه");
    return atomic(db, session, async () => {
        const employees = await db.collection("employees").find({ isArchived: { $ne: true } }).toArray();
        let created = 0, totalAccrued = 0;
        for (let employee of employees) {
            if (hasLegacyResumeShape(employee)) {
                const [documents, events] = await Promise.all([
                    db.collection("documents").find({ employeeId: employee.id, kind: "employee-accrual" }).toArray(),
                    db.collection("auditEvents").find({ employeeId: employee.id, action: { $in: ["payroll.employee.restore", "payroll.employee.update"] } }).toArray(),
                ]);
                const repaired = repairLegacyPayrollResume(employee, documents, events);
                if (repaired !== employee) {
                    repaired.updatedAt = now.toISOString();
                    const changed = await db.collection("employees").updateOne({ id: employee.id, revision: employee.revision }, {
                        $set: { agreements: repaired.agreements, revision: repaired.revision, updatedAt: repaired.updatedAt },
                    });
                    if (!changed.matchedCount)
                        throw fail("تغير الموظف أثناء العملية، أعد المحاولة", 409);
                    await audit(db, "employee.resume-repair", employee, repaired, now);
                    employee = repaired;
                }
            }
            const result = await accrueEmployee(db, employee, asOf, now, options.context ?? "automatic");
            created += result.created;
            totalAccrued += result.totalAccrued;
        }
        return { created, totalAccrued: amount(totalAccrued), employeeCount: employees.length };
    });
}
function agreementFrom(input, startDate, anchorDay) {
    return { id: id("agreement"), startDate, amount: amount(money(input.amount)), intervalMonths: interval(input.intervalMonths), entitlement: timing(input.entitlement), anchorDay };
}
function validateSchedule(schedule) {
    const active = schedule.filter(row => !row.canceledAt).sort((a, b) => a.startDate.localeCompare(b.startDate));
    for (const agreement of active) {
        day(agreement.startDate);
        if (interval(agreement.intervalMonths) !== agreement.intervalMonths || !Number.isSafeInteger(agreement.anchorDay) ||
            agreement.anchorDay < 1 || agreement.anchorDay > 31)
            throw fail("اتفاق الراتب غير صالح");
    }
    for (let index = 1; index < active.length; index++) {
        const previous = active[index - 1], current = active[index];
        if (previous.stopDate && previous.stopDate < current.startDate)
            continue;
        let at = previous.startDate;
        while (at < current.startDate)
            at = boundary(at, previous.intervalMonths, previous.anchorDay);
        if (at !== current.startDate || previous.startDate === current.startDate)
            throw fail("الاتفاق الجديد يجب أن يبدأ عند بداية فترة راتب تالية دون تداخل", 409);
    }
}
function clipSameDayStop(schedule, previous, resumeDate) {
    if (previous?.stopDate !== resumeDate || previous.startDate >= resumeDate)
        return schedule;
    return schedule.map(row => row.id === previous.id ? { ...row, stopDate: priorDay(resumeDate) } : row);
}
function hasLegacyResumeShape(employee) {
    const active = agreements(employee);
    return active.some((row, index) => row.startDate < employee.startDate || active[index - 1]?.stopDate === row.startDate);
}
const agreementTerms = ["id", "startDate", "amount", "intervalMonths", "entitlement", "anchorDay"];
function legacyAgreementEvent(employee, agreement, events, action = "payroll.employee.restore", maxRevision = employee.revision) {
    return events.find(event => {
        if (!event)
            return false;
        const { before, after } = event;
        return event.action === action && event.status === "committed" && event.employeeId === employee.id &&
            typeof event.createdAt === "string" && Number.isFinite(Date.parse(event.createdAt)) &&
            before?.id === employee.id && after?.id === employee.id &&
            before.isArchived === (action === "payroll.employee.restore") && after.isArchived === false &&
            before.startDate === employee.startDate && after.startDate === employee.startDate &&
            Number.isSafeInteger(before.revision) && after.revision === before.revision + 1 && after.revision <= maxRevision &&
            Array.isArray(before.agreements) && Array.isArray(after.agreements) &&
            !before.agreements.some((row) => row?.id === agreement.id) &&
            after.agreements.some((row) => row && agreementTerms.every(key => row[key] === agreement[key]));
    });
}
function legacyEarlyAgreement(employee, agreement, events) {
    if (agreement.startDate >= employee.startDate)
        return;
    let candidate = agreement, revision = employee.revision;
    for (;;) {
        const resumed = legacyAgreementEvent(employee, candidate, events, "payroll.employee.restore", revision);
        if (resumed?.before.agreements.some((row) => row?.startDate === employee.startDate && row.canceledAt))
            return resumed;
        const edited = legacyAgreementEvent(employee, candidate, events, "payroll.employee.update", revision);
        if (!edited)
            return;
        const previous = edited.before.agreements.find((row) => row?.startDate === candidate.startDate && !row.canceledAt);
        if (!previous) {
            if (edited.before.agreements.some((row) => row?.startDate === employee.startDate && !row.canceledAt))
                return edited;
            return;
        }
        candidate = previous;
        revision = edited.before.revision;
    }
}
/** Repair the schedule, retaining every historical accrual, allocation and cash entry. */
export function repairLegacyPayrollResume(employee, documents, events) {
    if (!Array.isArray(employee?.agreements) || !employee.agreements.every(row => row && typeof row.startDate === "string") ||
        !hasLegacyResumeShape(employee))
        return employee;
    let schedule = employee.agreements;
    const active = agreements(employee);
    const posted = documents.filter(row => row.employeeId === employee.id && row.kind === "employee-accrual" && row.status === "posted");
    for (const [index, agreement] of active.entries()) {
        const early = legacyEarlyAgreement(employee, agreement, events);
        if (early) {
            schedule = schedule.map(row => row.id === agreement.id ? { ...row, canceledAt: early.createdAt } : row);
            const successor = active[index + 1];
            if (!employee.isArchived && (!successor || successor.startDate >= employee.startDate)) {
                const lastEnd = posted.map(row => day(row.periodEnd)).sort().at(-1);
                const startDate = lastEnd && lastEnd >= employee.startDate ? shiftDay(lastEnd, 1) : employee.startDate;
                const replacement = { ...agreement, id: `${agreement.id}-after-start`, startDate, anchorDay: Number(startDate.slice(-2)) };
                delete replacement.stopDate;
                if (!successor)
                    schedule = [...schedule, replacement];
                else if (startDate < successor.startDate) {
                    const distance = monthsBetween(startDate, successor.startDate);
                    if (distance > 0 && distance % replacement.intervalMonths === 0 && boundary(startDate, distance, replacement.anchorDay) === successor.startDate) {
                        schedule = [...schedule, { ...replacement, stopDate: priorDay(successor.startDate) }];
                    }
                }
            }
        }
        const previous = active[index - 1];
        if (previous?.stopDate !== agreement.startDate || previous.startDate >= agreement.startDate)
            continue;
        const event = legacyAgreementEvent(employee, agreement, events);
        if (!event?.before.agreements.some((row) => row?.id === previous.id && row.stopDate === agreement.startDate) ||
            posted.some(row => row.agreementSnapshot?.id === previous.id && row.periodEnd >= agreement.startDate))
            continue;
        schedule = clipSameDayStop(schedule, previous, agreement.startDate);
    }
    if (schedule === employee.agreements)
        return employee;
    validateSchedule(schedule);
    return { ...employee, agreements: schedule.sort((a, b) => a.startDate.localeCompare(b.startDate)), revision: employee.revision + 1 };
}
async function paymentDate(input, employee, now) {
    const date = day(input.occurredAt ?? today(now));
    if (date < employee.startDate || date > today(now))
        throw fail("تاريخ الدفع يجب أن يكون بين بداية عمل الموظف واليوم");
    return date;
}
async function postPayment(db, session, employee, input, now, previous) {
    const cents = money(input.amount), date = await paymentDate(input, employee, now), ledger = await state(db, employee);
    const direction = input.direction ?? previous?.employeePaymentDirection ?? "withdraw";
    if (direction !== "withdraw" && direction !== "deposit")
        throw fail("نوع حركة حساب العامل غير صالح");
    const allowAdvance = input.direction !== undefined || previous?.employeePaymentVersion === 2;
    const account = await db.collection("paymentAccounts").findOne({ $or: [{ id: text(input.paymentMethod) }, { code: text(input.paymentMethod) }], isActive: true, isArchived: { $ne: true } });
    // Other commerce may leave sub-cent cash. Salary amounts are cents, but the
    // existing bank balance must retain its precision rather than be rounded.
    const balance = typeof account?.balance === "number" ? account.balance : typeof account?.balance === "string" && /^\d+(?:\.\d+)?$/.test(account.balance.trim()) ? Number(account.balance) : NaN;
    const required = amount(cents), tolerance = Math.min(1e-7, Number.EPSILON * Math.max(1, Math.abs(balance), required));
    if (!account || !Number.isFinite(balance) || (direction === "withdraw" && (balance < 0 || balance + tolerance < required)))
        throw fail("اختر حسابًا نشطًا برصيد يكفي مبلغ الصرف", 409);
    const allocations = [];
    let remaining = cents;
    for (const accrual of ledger.accruals.filter(row => row.status === "posted" && row.dueDate <= date).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)) || String(a.periodStart).localeCompare(String(b.periodStart)))) {
        const available = money(accrual.total) - (ledger.allocated.get(accrual.id) ?? 0), paid = Math.min(remaining, available);
        if (paid > 0)
            allocations.push({ accrualId: accrual.id, amount: amount(paid) });
        remaining -= paid;
        if (!remaining)
            break;
    }
    if (direction === "withdraw" && remaining && !allowAdvance)
        throw fail("المبلغ يتجاوز المستحق للموظف في تاريخ الدفع", 409);
    const independent = input.direction !== undefined || direction === "deposit" || remaining > 0 || previous?.employeePaymentVersion === 2;
    const document = { ...(previous ?? {}), id: previous?.id ?? id("employee-payment"), number: previous?.number ?? `EMP-PAY-${randomUUID()}`,
        kind: "employee-payment", status: "posted", revision: Number(previous?.revision ?? -1) + 1, employeeId: employee.id, employeeName: employee.name,
        employeeAccountOrder: previous?.employeeAccountOrder ?? Math.max(0, ...ledger.documents.map(row => Number(row.employeeAccountOrder ?? 0))) + 1,
        paymentMethod: account.id, total: amount(cents), amount: amount(cents), paidTotal: amount(cents), dueTotal: 0,
        employeePaymentDirection: direction, ...(independent ? { employeePaymentVersion: 2 } : {}), balanceDelta: (direction === "deposit" ? 1 : -1) * amount(cents),
        businessDate: date, occurredAt: iso(date), allocations: independent ? [] : allocations, note: text(input.note), lines: [], ...(previous ? { updatedAt: now.toISOString() } : { createdAt: now.toISOString() }) };
    const movement = await postFinancialMovement(db, session, document, direction === "deposit" ? "in" : "out", amount(cents), "employee-payment");
    await db.collection("financialMovements").updateOne({ id: movement.id }, { $set: { employeeId: employee.id, employeeName: employee.name } });
    await changeBalance(db, employee, (direction === "deposit" ? 1 : -1) * cents, now);
    if (previous)
        await db.collection("documents").updateOne({ id: document.id }, { $set: document });
    else
        await db.collection("documents").insertOne(document);
    return document;
}
async function undoPayment(db, session, employee, document, why, now, neutralDepositEdit = false) {
    const movement = await findActiveFinancialMovement(db, session, { documentId: document.id, type: "employee-payment" });
    if (!movement || money(movement.amount) !== money(document.total) || movement.direction !== (employeePaymentDirection(document) === "deposit" ? "in" : "out"))
        throw fail("حركة صرف الموظف الأصلية غير متطابقة", 409);
    const account = await db.collection("paymentAccounts").findOne({ id: document.paymentMethod });
    if (!neutralDepositEdit && employeePaymentDirection(document) === "deposit" && (!account || Number(account.balance) < Number(document.total)))
        throw fail("رصيد وسيلة الدفع لا يكفي لعكس إيداع العامل", 409);
    const reverseId = await reverseFinancialMovement(db, session, movement, why);
    await db.collection("financialMovements").updateOne({ id: reverseId }, { $set: { employeeId: employee.id, employeeName: document.employeeName } });
    await changeBalance(db, employee, -accountSign(document) * money(document.total), now);
    await db.collection("documents").updateOne({ id: document.id }, { $set: { status: "voided" } });
}
export async function handlePayrollCommand(db, session, input, now = new Date()) {
    return atomic(db, session, async (activeSession) => {
        const type = text(input.type), asOf = today(now);
        if (type === "employee-accrual.sync")
            return accrueDueEmployees(db, activeSession, { asOf, now });
        if (type === "employee.create") {
            const name = text(input.name), startDate = day(input.startDate);
            if (!name || name.length > 120 || text(input.phone).length > 40)
                throw fail("اسم الموظف مطلوب وبياناته يجب أن تكون صالحة");
            const employee = { id: id("employee"), name, phone: text(input.phone), startDate, balance: 0, revision: 0, isArchived: false,
                agreements: [agreementFrom(input, startDate, Number(startDate.slice(-2)))], createdAt: now.toISOString() };
            await db.collection("employees").insertOne(employee);
            await audit(db, type, null, employee, now);
            // Creating the card alone never materializes salary or bank movement.
            return employee.id;
        }
        if (type.startsWith("employee.")) {
            const employee = await employeeById(db, input.employeeId), before = structuredClone(employee);
            checkRevision(employee, input);
            await state(db, employee);
            if (type === "employee.archive") {
                if (employee.isArchived)
                    throw fail("الموظف مؤرشف بالفعل", 409);
                await accrueEmployee(db, employee, asOf, now, "archive");
                employee.agreements = employee.agreements.map(row => ({ ...row, ...(row.startDate > asOf ? { canceledAt: now.toISOString() } : { stopDate: row.stopDate && row.stopDate < asOf ? row.stopDate : asOf }) }));
                employee.isArchived = true;
                employee.archivedAt = now.toISOString();
            }
            else if (type === "employee.restore") {
                if (!employee.isArchived)
                    throw fail("الموظف غير مؤرشف", 409);
                const resumeDate = day(input.resumeDate);
                if (resumeDate < asOf || resumeDate < employee.startDate)
                    throw fail("تاريخ الاستئناف لا يمكن أن يسبق اليوم أو تاريخ بداية العامل");
                const posted = await db.collection("documents").find({ employeeId: employee.id, kind: "employee-accrual", status: "posted" }).toArray();
                if (posted.some(row => row.periodEnd >= resumeDate))
                    throw fail("تاريخ الاستئناف يتداخل مع فترة راتب معتمدة", 409);
                const previous = agreements(employee).at(-1) ?? employee.agreements.at(-1);
                employee.agreements = clipSameDayStop(employee.agreements, previous, resumeDate)
                    .map(row => row.startDate === resumeDate && !row.canceledAt ? { ...row, canceledAt: now.toISOString() } : row);
                employee.agreements.push(agreementFrom({ amount: input.amount ?? previous.amount, intervalMonths: input.intervalMonths ?? previous.intervalMonths, entitlement: input.entitlement ?? previous.entitlement }, resumeDate, Number(resumeDate.slice(-2))));
                validateSchedule(employee.agreements);
                employee.isArchived = false;
                employee.archivedAt = null;
            }
            else if (type === "employee.update") {
                const name = input.name === undefined ? employee.name : text(input.name), phone = input.phone === undefined ? employee.phone : text(input.phone);
                if (!name || name.length > 120 || phone.length > 40)
                    throw fail("بيانات الموظف غير صالحة");
                employee.name = name;
                employee.phone = phone;
                if (["amount", "intervalMonths", "entitlement", "effectiveFrom"].some(key => Object.hasOwn(input, key))) {
                    if (employee.isArchived)
                        throw fail("استأنف الموظف قبل تعديل اتفاق راتبه", 409);
                    const effective = day(input.effectiveFrom ?? nextPayrollAgreementStart(employee, asOf));
                    if (effective <= asOf || effective < employee.startDate)
                        throw fail("تعديل الاتفاق يطبق على فترة مستقبلية تبدأ من تاريخ بداية العامل أو بعده", 409);
                    const schedule = agreements(employee), previous = schedule.filter(row => row.startDate < effective).at(-1) ?? schedule[0];
                    const agreement = agreementFrom({ amount: input.amount ?? previous.amount, intervalMonths: input.intervalMonths ?? previous.intervalMonths, entitlement: input.entitlement ?? previous.entitlement }, effective, previous.anchorDay);
                    const rest = employee.agreements.filter(row => row.startDate !== effective);
                    employee.agreements = [...rest, agreement].sort((a, b) => a.startDate.localeCompare(b.startDate));
                    validateSchedule(employee.agreements);
                    if (await db.collection("documents").findOne({ employeeId: employee.id, kind: "employee-accrual", periodStart: { $gte: effective } }))
                        throw fail("الاتفاق يتداخل مع استحقاق مسجل", 409);
                }
            }
            else
                throw fail("عملية الموظفين غير مدعومة");
            employee.revision++;
            employee.updatedAt = now.toISOString();
            const changed = await db.collection("employees").updateOne({ id: employee.id, revision: before.revision }, { $set: employee });
            if (!changed.matchedCount)
                throw fail("تغير الموظف أثناء العملية", 409);
            await audit(db, type, before, employee, now);
            return employee.id;
        }
        if (type === "employee-payment.post") {
            const employee = await employeeById(db, input.employeeId);
            const document = await postPayment(db, activeSession, employee, input, now);
            await audit(db, type, null, document, now);
            return document.id;
        }
        if (["employee-payment.update", "employee-payment.void", "employee-accrual.update", "employee-accrual.void"].includes(type)) {
            const kind = type.startsWith("employee-payment") ? "employee-payment" : "employee-accrual";
            const document = await db.collection("documents").findOne({ id: text(input.documentId), kind, status: "posted" });
            if (!document)
                throw fail("سند الموظف غير موجود أو ملغى", 404);
            checkRevision(document, input);
            const why = reason(input), before = structuredClone(document);
            const employee = await employeeById(db, document.employeeId), ledger = await state(db, employee);
            if (kind === "employee-payment") {
                const originalAccount = type.endsWith("update") ? await db.collection("paymentAccounts").findOne({ id: document.paymentMethod }) : null;
                const targetAccount = type.endsWith("update") ? await db.collection("paymentAccounts").findOne({
                    $or: [{ id: text(input.paymentMethod ?? document.paymentMethod) }, { code: text(input.paymentMethod ?? document.paymentMethod) }],
                }) : null;
                const sameDepositAccount = type.endsWith("update") && employeePaymentDirection(document) === "deposit" &&
                    (input.direction ?? "deposit") === "deposit" && Boolean(originalAccount && targetAccount && originalAccount.id === targetAccount.id);
                if (sameDepositAccount && Number(originalAccount.balance) + amount(money(input.amount)) - Number(document.total) < 0) {
                    throw fail("رصيد وسيلة الدفع لا يكفي لعكس إيداع العامل", 409);
                }
                await undoPayment(db, activeSession, employee, document, why, now, sameDepositAccount);
                if (type.endsWith("update")) {
                    const revised = await postPayment(db, activeSession, employee, { ...input, occurredAt: input.occurredAt ?? document.businessDate, paymentMethod: input.paymentMethod ?? document.paymentMethod, note: input.note ?? document.note }, now, document);
                    if (originalAccount?.isArchived === true && revised.paymentMethod === originalAccount.id) {
                        await db.collection("paymentAccounts").updateOne({ id: originalAccount.id, balance: 0 }, {
                            $set: { isArchived: true, isActive: originalAccount.isActive, archivedAt: originalAccount.archivedAt, updatedAt: originalAccount.updatedAt },
                        });
                    }
                    await audit(db, type, before, { ...revised, reason: why }, now);
                    return document.id;
                }
            }
            else {
                const allocated = ledger.allocated.get(document.id) ?? 0;
                if (type.endsWith("void") && allocated) {
                    const blockers = ledger.documents.filter(row => row.kind === "employee-payment" && row.status === "posted" && row.allocations.some((allocation) => allocation.accrualId === document.id));
                    throw new PayrollError(`الاستحقاق مرتبط بدفعات ${blockers.map(row => String(row.number)).join("، ")}. عالج الدفعات المرتبطة أولًا`, 409, blockers.map(row => ({ documentId: row.id, number: row.number })));
                }
                const revisedAmount = type.endsWith("void") ? 0 : money(input.amount), date = input.occurredAt === undefined ? document.businessDate : day(input.occurredAt);
                if (revisedAmount < allocated)
                    throw fail("الاستحقاق المعدل لا يمكن أن يقل عن المبلغ المصروف منه", 409);
                const recordedEarlyDate = date === document.businessDate && document.agreementSnapshot?.startDate < employee.startDate;
                if ((date < employee.startDate && !recordedEarlyDate) || date > asOf)
                    throw fail("تاريخ الاستحقاق يجب أن يكون بين بداية الموظف واليوم");
                if (ledger.documents.some(row => row.kind === "employee-payment" && row.status === "posted" && row.allocations.some((allocation) => allocation.accrualId === document.id) && row.businessDate < date))
                    throw fail("تاريخ الاستحقاق المعدل يتجاوز تاريخ دفعة مرتبطة", 409);
                await changeBalance(db, employee, revisedAmount - money(document.total), now);
                if (type.endsWith("update")) {
                    const revised = { ...document, total: amount(revisedAmount), amount: amount(revisedAmount), balanceDelta: amount(revisedAmount), dueDate: date, businessDate: date, occurredAt: iso(date), revision: document.revision + 1, updatedAt: now.toISOString(), correctionReason: why };
                    await db.collection("documents").updateOne({ id: document.id }, { $set: revised });
                    await audit(db, type, before, revised, now);
                    return document.id;
                }
            }
            const revised = { ...document, status: "voided", revision: document.revision + 1, updatedAt: now.toISOString(), voidedAt: now.toISOString(), voidReason: why };
            await db.collection("documents").updateOne({ id: document.id }, { $set: revised });
            await audit(db, type, before, revised, now);
            return document.id;
        }
        throw fail("عملية الموظفين غير مدعومة");
    });
}
/** Match actual net drawings to earned salary. Deposits and advances alone are not income or expense. */
export function payrollExpenseEntries(documents) {
    const states = new Map();
    const entries = [];
    const ordered = documents.filter(row => row.status === "posted" && ["employee-accrual", "employee-payment"].includes(row.kind))
        .slice().sort((a, b) => String(a.businessDate).localeCompare(String(b.businessDate)) ||
        (a.kind === b.kind ? 0 : a.kind === "employee-accrual" ? -1 : 1) ||
        Number(a.employeeAccountOrder ?? 0) - Number(b.employeeAccountOrder ?? 0) ||
        String(a.createdAt ?? a.occurredAt).localeCompare(String(b.createdAt ?? b.occurredAt)));
    for (const document of ordered) {
        const state = states.get(document.employeeId) ?? { earned: 0, drawn: 0, recognized: 0 }, cents = money(document.total);
        if (document.kind === "employee-accrual")
            state.earned += cents;
        else
            state.drawn += employeePaymentDirection(document) === "deposit" ? -cents : cents;
        if (!Number.isSafeInteger(state.earned) || !Number.isSafeInteger(state.drawn))
            throw fail("مجموع حركات العامل يتجاوز النطاق المسموح");
        const recognized = Math.min(Math.max(state.drawn, 0), state.earned), delta = recognized - state.recognized;
        if (delta)
            entries.push({ documentId: document.id, employeeId: document.employeeId, employeeName: document.employeeName,
                businessDate: document.businessDate, occurredAt: document.occurredAt, total: amount(delta) });
        state.recognized = recognized;
        states.set(document.employeeId, state);
    }
    return entries;
}
export function payrollSummary(employees, documents, period = {}) {
    const from = period.from ? day(period.from) : "", to = period.to ? day(period.to) : "";
    if (from && to && from > to)
        throw fail("بداية الفترة تتجاوز نهايتها");
    const rows = employees.map(employee => ({ employeeId: String(employee.id), name: String(employee.name), currentOwed: 0, currentReceivable: 0, currentUnpaidWages: 0, closingBalance: 0, accrualPeriod: 0, paidPeriod: 0, reserveChange: 0 }));
    const byId = new Map(rows.map(row => [row.employeeId, row]));
    for (const document of documents) {
        if (document.status !== "posted" || !["employee-accrual", "employee-payment"].includes(document.kind))
            continue;
        const row = byId.get(String(document.employeeId));
        if (!row)
            continue;
        const date = String(document.businessDate ?? document.occurredAt?.slice(0, 10)), cents = money(document.total), sign = accountSign(document);
        row.currentOwed += sign * cents;
        if (document.kind === "employee-accrual")
            row.currentUnpaidWages += cents;
        if (!to || date <= to)
            row.closingBalance += sign * cents;
        if ((!from || date >= from) && (!to || date <= to)) {
            if (document.kind === "employee-accrual")
                row.accrualPeriod += cents;
        }
    }
    for (const entry of payrollExpenseEntries(documents)) {
        const row = byId.get(entry.employeeId);
        if (!row)
            continue;
        row.currentUnpaidWages -= signedMoney(entry.total);
        if ((!from || entry.businessDate >= from) && (!to || entry.businessDate <= to)) {
            row.paidPeriod += signedMoney(entry.total);
        }
    }
    const totals = { currentOwed: 0, currentReceivable: 0, currentUnpaidWages: 0, closingBalance: 0, accrualPeriod: 0, paidPeriod: 0, reserveChange: 0 };
    for (const row of rows) {
        row.currentReceivable = Math.max(-row.currentOwed, 0);
        row.currentOwed = Math.max(row.currentOwed, 0);
        row.reserveChange = row.accrualPeriod - row.paidPeriod;
        for (const key of Object.keys(totals)) {
            totals[key] += row[key];
            row[key] = amount(row[key]);
        }
    }
    return { ...Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, amount(value)])), rows };
}
/** Restore validates the whole employee ledger before replacing the current dataset. */
export function validatePayrollSnapshot(employees, documents, financialMovements, events = []) {
    const employeeMap = new Map(), agreementMaps = new Map();
    const verifiedEarlyAgreements = new Set();
    const invalid = () => fail("بيانات الموظفين أو روابط استحقاقاتهم ودفعاتهم غير صالحة");
    const validId = (value) => typeof value === "string" && value.length > 0 && value.trim() === value;
    const validRevision = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
    const validAgreement = (row) => {
        if (!row || !validId(row.id) || typeof row.amount !== "number" || !validRevision(row.anchorDay) || row.anchorDay < 1 || row.anchorDay > 31 ||
            typeof row.intervalMonths !== "number" || interval(row.intervalMonths) !== row.intervalMonths)
            throw invalid();
        money(row.amount);
        day(row.startDate);
        timing(row.entitlement);
        if (row.stopDate !== undefined && day(row.stopDate) < row.startDate)
            throw invalid();
        if (row.canceledAt !== undefined && (typeof row.canceledAt !== "string" || !Number.isFinite(Date.parse(row.canceledAt))))
            throw invalid();
    };
    for (const employee of employees) {
        if (!validId(employee.id) || employeeMap.has(employee.id) || typeof employee.name !== "string" || !employee.name.trim() || employee.name.length > 120 ||
            typeof employee.balance !== "number" || !validRevision(employee.revision) || typeof employee.isArchived !== "boolean" ||
            (employee.phone !== undefined && (typeof employee.phone !== "string" || employee.phone.length > 40)) || !Array.isArray(employee.agreements) || !employee.agreements.length)
            throw invalid();
        signedMoney(employee.balance);
        day(employee.startDate);
        const map = new Map();
        for (const agreement of employee.agreements) {
            validAgreement(agreement);
            if (map.has(agreement.id))
                throw invalid();
            if (agreement.startDate < employee.startDate) {
                if (!agreement.canceledAt || !legacyEarlyAgreement(employee, agreement, events))
                    throw invalid();
                verifiedEarlyAgreements.add(JSON.stringify([employee.id, agreement.id]));
            }
            map.set(agreement.id, agreement);
        }
        if (!employee.isArchived && !employee.agreements.some((row) => !row.canceledAt))
            throw invalid();
        validateSchedule(employee.agreements);
        employeeMap.set(employee.id, employee);
        agreementMaps.set(employee.id, map);
    }
    const payroll = documents.filter(row => ["employee-accrual", "employee-payment"].includes(row.kind));
    const documentMap = new Map(), accruals = new Map(), allocations = new Map(), balances = new Map();
    const movementOrders = new Set();
    for (const document of payroll) {
        if (!validId(document.id) || documentMap.has(document.id) || !employeeMap.has(document.employeeId) || !validRevision(document.revision) ||
            !["posted", "voided"].includes(document.status) || typeof document.total !== "number" || document.amount !== document.total || !validId(document.number) ||
            !Array.isArray(document.lines) || document.lines.length !== 0)
            throw invalid();
        const date = day(document.businessDate), cents = money(document.total);
        if (document.employeeAccountOrder !== undefined && (!Number.isSafeInteger(document.employeeAccountOrder) || document.employeeAccountOrder < 1))
            throw invalid();
        if (document.employeeAccountOrder !== undefined) {
            const key = JSON.stringify([document.employeeId, document.employeeAccountOrder]);
            if (movementOrders.has(key))
                throw invalid();
            movementOrders.add(key);
        }
        const legacyEarlyAccrual = document.kind === "employee-accrual" && verifiedEarlyAgreements.has(JSON.stringify([document.employeeId, document.agreementSnapshot?.id]));
        if (typeof document.occurredAt !== "string" || !Number.isFinite(Date.parse(document.occurredAt)) || document.occurredAt.slice(0, 10) !== date ||
            (date < employeeMap.get(document.employeeId).startDate && !legacyEarlyAccrual))
            throw invalid();
        const sign = accountSign(document);
        if (document.balanceDelta !== amount(sign * cents))
            throw invalid();
        if (document.status === "posted")
            balances.set(document.employeeId, (balances.get(document.employeeId) ?? 0) + sign * cents);
        documentMap.set(document.id, document);
        if (document.kind === "employee-accrual") {
            const start = day(document.periodStart), end = day(document.periodEnd), snapshot = document.agreementSnapshot;
            validAgreement(snapshot);
            const saved = agreementMaps.get(document.employeeId).get(snapshot.id);
            if (!saved || ["startDate", "amount", "intervalMonths", "entitlement", "anchorDay"].some(key => saved[key] !== snapshot[key]) ||
                start < snapshot.startDate || end !== priorDay(boundary(start, snapshot.intervalMonths, snapshot.anchorDay)) || document.dueDate !== date ||
                document.id !== accrualId(document.employeeId, start))
                throw invalid();
            const months = monthsBetween(snapshot.startDate, start);
            if (months < 0 || months % snapshot.intervalMonths !== 0 || boundary(snapshot.startDate, months, snapshot.anchorDay) !== start)
                throw invalid();
            accruals.set(document.id, document);
        }
    }
    for (const employee of employees) {
        if ((balances.get(employee.id) ?? 0) !== signedMoney(employee.balance))
            throw invalid();
        let previousEnd = "";
        for (const row of [...accruals.values()].filter(item => item.employeeId === employee.id && item.status === "posted").sort((a, b) => a.periodStart.localeCompare(b.periodStart))) {
            if (previousEnd && row.periodStart <= previousEnd)
                throw invalid();
            previousEnd = row.periodEnd;
        }
    }
    for (const payment of payroll.filter(row => row.kind === "employee-payment")) {
        if (!validId(payment.paymentMethod) || !Array.isArray(payment.allocations))
            throw invalid();
        if (payment.employeePaymentVersion === 2) {
            if (payment.allocations.length || payment.employeeAccountOrder === undefined || !["withdraw", "deposit"].includes(payment.employeePaymentDirection))
                throw invalid();
            continue;
        }
        if (payment.employeePaymentVersion !== undefined || employeePaymentDirection(payment) !== "withdraw" || !payment.allocations.length)
            throw invalid();
        let total = 0;
        const seen = new Set();
        for (const allocation of payment.allocations) {
            const source = accruals.get(allocation.accrualId);
            if (!source || source.employeeId !== payment.employeeId || seen.has(source.id) || typeof allocation.amount !== "number")
                throw invalid();
            const cents = money(allocation.amount);
            total += cents;
            seen.add(source.id);
            if (payment.status === "posted") {
                if (source.status !== "posted" || source.dueDate > payment.businessDate)
                    throw invalid();
                const allocated = (allocations.get(source.id) ?? 0) + cents;
                if (allocated > money(source.total))
                    throw invalid();
                allocations.set(source.id, allocated);
            }
        }
        if (total !== money(payment.total))
            throw invalid();
    }
    const movementMap = new Map(), active = new Map();
    for (const movement of financialMovements) {
        if (movement.employeeId && !employeeMap.has(movement.employeeId))
            throw invalid();
        if (!String(movement.type).startsWith("employee-payment"))
            continue;
        if (!validId(movement.id) || movementMap.has(movement.id) || !employeeMap.has(movement.employeeId) || !documentMap.has(movement.documentId) ||
            documentMap.get(movement.documentId).kind !== "employee-payment" || documentMap.get(movement.documentId).employeeId !== movement.employeeId ||
            !["posted", "reversed"].includes(movement.status) || typeof movement.amount !== "number")
            throw invalid();
        money(movement.amount);
        movementMap.set(movement.id, movement);
        if (movement.status !== "reversed" && movement.isReversal !== true) {
            const payment = documentMap.get(movement.documentId);
            if (movement.type !== "employee-payment" || payment.status !== "posted" || movement.direction !== (employeePaymentDirection(payment) === "deposit" ? "in" : "out") || movement.amount !== payment.total ||
                movement.paymentMethod !== payment.paymentMethod || movement.occurredAt !== payment.occurredAt || movement.revision !== payment.revision)
                throw invalid();
            active.set(payment.id, (active.get(payment.id) ?? 0) + 1);
        }
    }
    for (const payment of payroll.filter(row => row.kind === "employee-payment")) {
        if ((active.get(payment.id) ?? 0) !== (payment.status === "posted" ? 1 : 0))
            throw invalid();
    }
    for (const movement of movementMap.values()) {
        if (movement.isReversal === true) {
            const original = movementMap.get(movement.reversalOfMovementId);
            if (!original || original.status !== "reversed" || original.reversalMovementId !== movement.id || original.documentId !== movement.documentId ||
                original.paymentMethod !== movement.paymentMethod || original.amount !== movement.amount || movement.direction !== (original.direction === "out" ? "in" : "out"))
                throw invalid();
        }
        else if (movement.status === "reversed") {
            const reversal = movementMap.get(movement.reversalMovementId);
            if (!reversal || reversal.isReversal !== true || reversal.reversalOfMovementId !== movement.id)
                throw invalid();
        }
    }
}

function finiteAmount(value) {
    if (typeof value !== "number" && (typeof value !== "string" || !value.trim()))
        return null;
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : null;
}
const cents = (value) => Math.round((finiteAmount(value) ?? 0) * 100);
/** Worker balances use the opposite sign to the shop's receivable/payable ledger. */
export function employeeAccountRow(employee) {
    const net = cents(employee.balance) ? -cents(employee.balance) / 100 : 0;
    return {
        id: String(employee.id), partyId: String(employee.id), employeeId: String(employee.id),
        name: String(employee.name ?? ""), phone: String(employee.phone ?? ""),
        partyType: "employee", accountType: "عامل", balance: Math.abs(net), net,
        receivable: Math.max(net, 0), payable: Math.max(-net, 0),
        lastMovement: String(employee.lastMovementAt ?? employee.updatedAt ?? ""),
    };
}
function employeeDelta(document) {
    const saved = finiteAmount(document.balanceDelta);
    if (saved !== null)
        return cents(saved);
    const amount = cents(document.total);
    if (document.kind === "employee-accrual")
        return amount;
    return employeePaymentDirection(document) === "deposit" ? amount : -amount;
}
/** Running balances include the full posted history before period selection or paging. */
export function buildEmployeeLedger(employee, documents, period = {}) {
    const employeeId = String(employee.id);
    const posted = documents.filter(document => document.employeeId === employeeId && document.status === "posted" &&
        (document.kind === "employee-accrual" || document.kind === "employee-payment"));
    const ordered = [...posted].sort((left, right) => String(left.businessDate ?? String(left.occurredAt).slice(0, 10)).localeCompare(String(right.businessDate ?? String(right.occurredAt).slice(0, 10))) ||
        Number(left.kind === "employee-payment") - Number(right.kind === "employee-payment") ||
        Number(left.employeeAccountOrder ?? 0) - Number(right.employeeAccountOrder ?? 0) ||
        String(left.createdAt ?? left.occurredAt).localeCompare(String(right.createdAt ?? right.occurredAt)) ||
        String(left.id).localeCompare(String(right.id)));
    let running = 0, opening = 0, closing = 0, debit = 0, credit = 0;
    let accrued = 0, withdrawn = 0, deposited = 0;
    const rows = [];
    for (const document of ordered) {
        const delta = -employeeDelta(document);
        const day = String(document.businessDate ?? document.occurredAt ?? "").slice(0, 10);
        running += delta;
        if (period.from && day < period.from)
            opening += delta;
        if (!period.to || day <= period.to)
            closing += delta;
        if ((period.from && day < period.from) || (period.to && day > period.to))
            continue;
        const isAccrual = document.kind === "employee-accrual";
        const direction = employeePaymentDirection(document);
        const movementCode = isAccrual ? "employee-accrual" : direction === "deposit" ? "employee-deposit" : "employee-withdrawal";
        const movementType = isAccrual ? "استحقاق عامل" : direction === "deposit" ? "إيداع من العامل" : "سحب العامل";
        debit += Math.max(delta, 0);
        credit += Math.max(-delta, 0);
        if (isAccrual)
            accrued += cents(document.total);
        else if (direction === "deposit")
            deposited += cents(document.total);
        else
            withdrawn += cents(document.total);
        const note = typeof document.note === "string" ? document.note.trim() : "";
        rows.push({
            id: String(document.id), documentId: String(document.id), partyId: employeeId, employeeId, partyType: "employee",
            occurredAt: String(document.occurredAt), movementType, movementCode,
            documentNumber: displayDocumentNumber(document), description: movementType + (note ? ` — ${note}` : ""),
            descriptionCode: movementCode, debit: Math.max(delta, 0) / 100, credit: Math.max(-delta, 0) / 100,
            balance: running / 100, runningBalance: running / 100, paymentMethod: String(document.paymentMethod ?? ""),
        });
    }
    const current = cents(employee.balance) ? -cents(employee.balance) : 0;
    return {
        rows: rows.reverse(),
        summary: {
            name: String(employee.name ?? ""), partyType: "employee", tradeTotal: 0,
            workersAccrued: accrued / 100, workersPaid: withdrawn / 100, workersDeposited: deposited / 100,
            debitTotal: debit / 100, creditTotal: credit / 100,
            openingBalance: opening / 100, closingBalance: closing / 100, currentBalance: current / 100,
            net: current / 100, receivable: Math.max(current, 0) / 100, payable: Math.max(-current, 0) / 100,
            reconciliationDifference: (current - running) / 100, transactionCount: rows.length,
        },
    };
}

// The adapter is deliberately limited to the four collections the original
// payroll engine uses. It never exposes the caller's live state to mutations.
const isPayroll = row => ['employee-accrual', 'employee-payment'].includes(row.kind);
const copy = value => structuredClone(value);
const canonicalRecord = row => ({ ...copy(row), id: row.payrollDocumentId, status: row.voided ? 'voided' : row.status ?? 'posted',
    businessDate: row.businessDate ?? row.date, occurredAt: row.occurredAt ?? `${row.date}T12:00:00.000Z`,
    paymentMethod: row.paymentMethod == null ? row.account == null ? undefined : String(row.account) : String(row.paymentMethod),
    paidTotal: row.paidTotal ?? row.paid ?? 0, dueTotal: row.dueTotal ?? row.due ?? 0 });
const payrollDocuments = state => (state.records ?? []).filter(isPayroll).map(canonicalRecord);
const accountDocument = row => ({ ...copy(row), id: String(row.id), _id: String(row.id), code: String(row.code ?? row.id),
    isActive: row.active !== undefined ? row.active !== false : row.isActive !== false,
    isArchived: row.archived !== undefined ? row.archived === true : row.isArchived === true });
function matches(row, query = {}) {
    return Object.entries(query).every(([key, wanted]) => {
        if (key === '$or') return wanted.some(part => matches(row, part));
        if (key === '$and') return wanted.every(part => matches(row, part));
        const actual = row[key];
        if (wanted && typeof wanted === 'object' && !Array.isArray(wanted)) return Object.entries(wanted).every(([op, value]) => {
            if (op === '$ne') return actual !== value;
            if (op === '$in') return value.includes(actual);
            if (op === '$gte') return actual >= value;
            if (op === '$gt') return actual > value;
            if (op === '$exists') return (actual !== undefined) === value;
            throw new PayrollError('عامل بحث الموظفين غير صالح');
        });
        return actual === wanted;
    });
}
function mobileDatabase(state, now, actor) {
    const points = new Map();
    const replace = value => { for (const key of Object.keys(state)) delete state[key]; Object.assign(state, value); };
    const rows = name => name === 'documents' ? payrollDocuments(state) : name === 'paymentAccounts' ? state.accounts.map(accountDocument)
        : copy(state[{ employees: 'employees', financialMovements: 'payrollFinancialMovements', auditEvents: 'auditEvents' }[name]] ?? []);
    const save = (name, document, inserting = false) => {
        if (name === 'documents') {
            let index = state.records.findIndex(row => row.payrollDocumentId === document.id);
            const previous = index < 0 ? null : state.records[index];
            if (inserting && previous) throw new PayrollError('سند الموظف مكرر', 409);
            const recordId = previous?.id ?? state.records.reduce((n, row) => Math.max(n, Number(row.id) || 0), 100) + 1;
            const record = { ...(previous ?? {}), ...copy(document), id: recordId, payrollDocumentId: document.id,
                sourceDocumentId: document.id, date: document.businessDate, time: '12:00', title: document.employeeName,
                subtitle: document.kind === 'employee-accrual' ? 'استحقاق عامل' : employeePaymentDirection(document) === 'deposit' ? 'إيداع من العامل' : 'سحب العامل',
                paid: Number(document.paidTotal ?? 0), due: Number(document.dueTotal ?? 0), voided: document.status === 'voided',
                account: document.paymentMethod == null ? null : state.accounts.find(a => String(a.id) === String(document.paymentMethod) || String(a.code) === String(document.paymentMethod))?.id ?? null };
            if (index < 0) state.records.unshift(record); else state.records[index] = record;
            return;
        }
        if (name === 'paymentAccounts') {
            const account = state.accounts.find(row => String(row.id) === String(document.id));
            if (!account) throw new PayrollError('وسيلة الدفع غير موجودة', 409);
            const previous = accountDocument(account);
            // The projection has synthetic desktop ids/flags. Do not write them
            // back into phone account cards or change untouched archive metadata.
            for (const key of Object.keys(document)) {
                if (['id', '_id', 'isActive', 'isArchived'].includes(key) || Object.is(document[key], previous[key])) continue;
                if (document[key] === undefined) delete account[key]; else account[key] = copy(document[key]);
            }
            if (document.isActive !== previous.isActive) account.active = document.isActive;
            if (document.isArchived !== previous.isArchived) account.archived = document.isArchived;
            return;
        }
        const key = { employees: 'employees', financialMovements: 'payrollFinancialMovements', auditEvents: 'auditEvents' }[name];
        if (!key) throw new PayrollError('مجموعة الموظفين غير صالحة');
        const index = state[key].findIndex(row => row.id === document.id);
        if (inserting && index >= 0) throw new PayrollError('سجل الموظف مكرر', 409);
        const saved = copy(document);
        if (name === 'auditEvents' && actor) { saved.actorId = actor.id; saved.actorName = actor.name; }
        if (index < 0) state[key].push(saved); else state[key][index] = saved;
    };
    return {
        now,
        native: { inTransaction: true, exec(command) {
            const point = command.split(' ').at(-1);
            if (command.startsWith('SAVEPOINT ')) points.set(point, copy(state));
            else if (command.startsWith('ROLLBACK TO SAVEPOINT ')) replace(copy(points.get(point)));
            else if (command.startsWith('RELEASE SAVEPOINT ')) points.delete(point);
            else throw new PayrollError('حد العملية غير صالح');
        } },
        async transaction(work) { const before = copy(state); try { return await work({}); } catch (error) { replace(before); throw error; } },
        collection(name) { return {
            find(query = {}) { return { async toArray() { return rows(name).filter(row => matches(row, query)); } }; },
            async findOne(query = {}) { return rows(name).find(row => matches(row, query)) ?? null; },
            async insertOne(document) { save(name, document, true); return { insertedId: document.id }; },
            async updateOne(query, update) {
                const document = rows(name).find(row => matches(row, query));
                if (!document) return { matchedCount: 0, modifiedCount: 0 };
                for (const [key, value] of Object.entries(update.$inc ?? {})) document[key] = Number(document[key] ?? 0) + value;
                Object.assign(document, copy(update.$set ?? {}));
                for (const key of Object.keys(update.$unset ?? {})) delete document[key];
                save(name, document); return { matchedCount: 1, modifiedCount: 1 };
            },
        }; },
    };
}
async function postFinancialMovement(db, session, document, direction, value, type) {
    const account = await db.collection('paymentAccounts').findOne({ id: document.paymentMethod, isActive: true, isArchived: { $ne: true } });
    if (!account) throw new PayrollError('يجب اختيار وسيلة دفع صالحة');
    await db.collection('paymentAccounts').updateOne({ id: account.id }, { $inc: { balance: direction === 'in' ? value : -value } });
    const movement = { id: id('fin'), paymentMethod: account.id, paymentCode: account.code, direction, amount: value,
        documentId: document.id, documentNumber: document.number, partyId: null, partyName: null, type, occurredAt: document.occurredAt,
        transferId: null, note: document.note ?? null, status: 'posted', revision: Number(document.revision ?? 0) };
    await db.collection('financialMovements').insertOne(movement);
    return movement;
}
async function findActiveFinancialMovement(db, session, query) {
    return db.collection('financialMovements').findOne({ ...query, status: { $ne: 'reversed' }, isReversal: { $ne: true } });
}
async function reverseFinancialMovement(db, session, movement, why) {
    if (!movement || movement.status === 'reversed' || movement.isReversal === true) throw new PayrollError('الحركة المالية ملغاة أو غير قابلة للعكس', 409);
    const account = await db.collection('paymentAccounts').findOne({ id: movement.paymentMethod });
    if (!account) throw new PayrollError('وسيلة الدفع غير موجودة', 409);
    const direction = movement.direction === 'out' ? 'in' : 'out', delta = direction === 'in' ? movement.amount : -movement.amount;
    const resulting = Number(account.balance) + delta;
    await db.collection('paymentAccounts').updateOne({ id: account.id }, { $inc: { balance: delta },
        ...(account.isArchived && resulting !== 0 ? { $set: { isArchived: false, isActive: true, archivedAt: null, updatedAt: db.now.toISOString() } } : {}) });
    const reverseId = id('fin');
    const changed = await db.collection('financialMovements').updateOne({ id: movement.id, status: { $ne: 'reversed' } },
        { $set: { status: 'reversed', reversedAt: db.now.toISOString(), reversalMovementId: reverseId, reversalReason: why } });
    if (!changed.matchedCount) throw new PayrollError('تغيرت الحركة المالية أثناء العملية', 409);
    await db.collection('financialMovements').insertOne({ id: reverseId, paymentMethod: account.id, paymentCode: movement.paymentCode ?? account.code,
        direction, amount: movement.amount, documentId: movement.documentId, documentNumber: movement.documentNumber,
        partyId: null, partyName: null, type: movement.type + ':reversal', occurredAt: db.now.toISOString(), transferId: null,
        note: why, status: 'posted', isReversal: true, reversalOfMovementId: movement.id });
    return reverseId;
}

/** Additive defaults only; caller owns when this state becomes durable. */
export function ensurePayrollState(state) {
    for (const key of ['employees', 'payrollFinancialMovements', 'auditEvents']) {
        if (state[key] === undefined) state[key] = [];
        if (!Array.isArray(state[key])) throw new PayrollError('بيانات الموظفين غير صالحة');
    }
    if (!Array.isArray(state.records) || !Array.isArray(state.accounts)) throw new PayrollError('بيانات المحل غير صالحة');
    return state;
}
const readPayrollState = state => ensurePayrollState({ ...state,
    employees: state.employees ?? [], payrollFinancialMovements: state.payrollFinancialMovements ?? [], auditEvents: state.auditEvents ?? [] });
export function validatePayrollState(input) {
    const state = readPayrollState(input);
    const records = state.records.filter(isPayroll), numericIds = new Set(), canonicalIds = new Set();
    const recordCounts = new Map();
    for (const record of state.records) recordCounts.set(record.id, (recordCounts.get(record.id) ?? 0) + 1);
    for (const record of records) {
        if (!Number.isSafeInteger(record.id) || record.id <= 0 || numericIds.has(record.id) || typeof record.payrollDocumentId !== 'string' || !record.payrollDocumentId || canonicalIds.has(record.payrollDocumentId)) throw new PayrollError('معرف سند العامل غير صالح');
        numericIds.add(record.id); canonicalIds.add(record.payrollDocumentId);
        if (recordCounts.get(record.id) !== 1) throw new PayrollError('معرف العملية مكرر');
        if (record.sourceDocumentId !== undefined && record.sourceDocumentId !== record.payrollDocumentId) throw new PayrollError('مصدر سند العامل غير مطابق');
        // The approved phone reads these aliases in its cash and record screens.
        // A backup cannot disagree with the canonical payroll ledger on status,
        // date, amount or bank identity and thereby acquire two financial meanings.
        if (typeof record.voided !== 'boolean' || record.voided !== (record.status === 'voided') || record.date !== record.businessDate ||
            record.total !== record.amount || record.paid !== Number(record.paidTotal ?? 0) || record.due !== Number(record.dueTotal ?? 0) ||
            record.kind === 'employee-accrual' && (record.account !== null || record.paid !== 0 || record.due !== 0) ||
            record.kind === 'employee-payment' && (record.paid !== record.total || record.due !== 0 || String(record.account) !== record.paymentMethod))
            throw new PayrollError('بيانات سند العامل غير متطابقة');
        if (record.kind === 'employee-payment' && !state.accounts.some(a => String(a.id) === String(record.paymentMethod))) throw new PayrollError('سند عامل يشير إلى وسيلة دفع مفقودة');
    }
    for (const movement of state.payrollFinancialMovements) if (!state.accounts.some(a => String(a.id) === String(movement.paymentMethod))) throw new PayrollError('حركة عامل تشير إلى وسيلة دفع مفقودة');
    validatePayrollSnapshot(state.employees, payrollDocuments(state), state.payrollFinancialMovements, state.auditEvents);
    return true;
}
const commandPermission = action => action.startsWith('employee-payment.') ? 'employees.pay' : 'employees.manage';
function authorize(actor, action) {
    if (!actor || actor.role === 'owner' || actor.principalType === 'owner') return;
    if (!(actor.capabilities ?? actor.permissions ?? []).includes(commandPermission(action))) throw new PayrollError('لا تسمح صلاحيات حسابك بهذا الإجراء', 403);
}
const stableJson = value => JSON.stringify((function stable(input) { return Array.isArray(input) ? input.map(stable) : input && typeof input === 'object' ? Object.fromEntries(Object.keys(input).sort().map(key => [key, stable(input[key])])) : input; })(value));
function clockNow(value) { const now = value === undefined ? new Date() : new Date(value); if (!Number.isFinite(now.valueOf())) throw new PayrollError('التاريخ غير صالح'); return now; }
export async function commandPayroll(inputState, action, input = {}, options = {}) {
    authorize(options.actor, action);
    if (!/^(employee\.(create|update|archive|restore)|employee-payment\.(post|update|void)|employee-accrual\.(sync|update|void))$/.test(action)) throw new PayrollError('عملية الموظفين غير مدعومة');
    const state = ensurePayrollState(copy(inputState)), now = clockNow(options.now);
    validatePayrollState(state);
    const key = options.idempotencyKey, fingerprint = sha256(stableJson({ action, input })), scope = String(options.actor?.id ?? 'local');
    if (key !== undefined && (typeof key !== 'string' || !key || key.length > 200)) throw new PayrollError('معرف المحاولة غير صالح');
    const prior = key && state.auditEvents.find(row => row.action === 'payroll.command.receipt' && row.requestKey === key && row.actorScope === scope);
    if (prior) {
        if (prior.fingerprint !== fingerprint) throw new PayrollError('معرف المحاولة مستخدم لعملية أخرى', 409);
        return { state, id: prior.result, result: prior.result, replayed: true, changed: false };
    }
    const body = { ...copy(input), type: action };
    if (body.paymentMethod !== undefined) body.paymentMethod = String(body.paymentMethod);
    if (body.documentId !== undefined) body.documentId = state.records.find(row => row.id === Number(body.documentId) && isPayroll(row))?.payrollDocumentId ?? body.documentId;
    const result = await handlePayrollCommand(mobileDatabase(state, now, options.actor), {}, body, now);
    if (key) state.auditEvents.push({ id: id('payroll-receipt'), action: 'payroll.command.receipt', status: 'committed', requestKey: key, actorScope: scope, fingerprint, result, createdAt: now.toISOString() });
    validatePayrollState(state);
    const record = state.records.find(row => row.payrollDocumentId === result);
    return { state, id: result, result, record, changed: true, replayed: false };
}
export async function materializePayroll(inputState, options = {}) {
    if (typeof options === 'string') options = { asOf: options };
    const state = ensurePayrollState(copy(inputState)), now = clockNow(options.now);
    validatePayrollState(state);
    const result = await accrueDueEmployees(mobileDatabase(state, now, options.actor), {}, { asOf: options.asOf, now, context: options.context ?? 'mobile-bootstrap' });
    validatePayrollState(state);
    return { state, ...result, changed: stableJson(state) !== stableJson(inputState) };
}
/** Full history is recognized first; the period/account selects its actual sources. */
export function payrollFacts(inputState, filters = {}) {
    const state = readPayrollState(inputState), documents = payrollDocuments(state);
    const employees = state.employees.filter(employee => !filters.employeeId || employee.id === filters.employeeId);
    const summary = payrollSummary(employees, documents, filters), byId = new Map(state.records.filter(isPayroll).map(row => [row.payrollDocumentId, row]));
    const entries = payrollExpenseEntries(documents).filter(entry => (!filters.from || entry.businessDate >= filters.from) && (!filters.to || entry.businessDate <= filters.to) && (!filters.employeeId || entry.employeeId === filters.employeeId)).flatMap(entry => {
        const record = byId.get(entry.documentId);
        if (!record || (filters.accountId && String(record.account) !== String(filters.accountId))) return [];
        return [{ ...entry, payrollDocumentId: entry.documentId, sourceDocumentId: entry.documentId, sourceRecordId: record.id, documentId: record.id,
            id: record.id, date: entry.businessDate, kind: record.kind, record, account: record.account, action: 'invoice:' + record.id, expenseCategoryKind: 'recurring' }];
    });
    const accounts = employees.filter(employee => !employee.isArchived || employee.balance !== 0).map(employeeAccountRow);
    return { ...summary, entries, employees: accounts, workersAccrued: summary.accrualPeriod, workersExpense: summary.paidPeriod,
        workersPaid: summary.paidPeriod, workersReserveChange: summary.reserveChange, currentWorkersOwed: summary.currentOwed,
        currentWorkersReceivable: summary.currentReceivable, currentWorkersUnpaidWages: summary.currentUnpaidWages };
}
export function employeeLedger(inputState, employeeId, filters = {}) {
    const state = readPayrollState(inputState), employee = state.employees.find(row => row.id === employeeId);
    if (!employee) throw new PayrollError('العامل غير موجود', 404);
    const result = buildEmployeeLedger(employee, payrollDocuments(state), filters), byId = new Map(state.records.filter(isPayroll).map(row => [row.payrollDocumentId, row]));
    return { ...result, employee, rows: result.rows.map(row => { const record = byId.get(row.documentId); return { ...row,
        payrollDocumentId: row.documentId, sourceDocumentId: row.documentId, id: record?.id, documentId: record?.id,
        date: row.occurredAt.slice(0, 10), action: record ? 'invoice:' + record.id : undefined, change: row.debit - row.credit }; }) };
}
export function payrollCanonicalDocuments(state) { return payrollDocuments(state); }
