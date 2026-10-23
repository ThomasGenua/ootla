/** Display actual instants in the property's IANA zone; never infer a civil booking time. */
export function calendarDay(value: string | Date, timeZone: string): string {
 const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(typeof value === 'string' ? new Date(value) : value);
 return ['year','month','day'].map(kind => parts.find(part => part.type === kind)?.value ?? '').join('-');
}
export function offsetAt(value: string, timeZone: string): string {
 const name = new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'longOffset' }).formatToParts(new Date(value)).find(part => part.type === 'timeZoneName')?.value ?? 'GMT';
 return name.replace('GMT', 'UTC').replace('−', '-');
}
export function viewingTime(startsAt: string, endsAt: string, timeZone: string): string {
 const start = new Date(startsAt), end = new Date(endsAt);
 const date = new Intl.DateTimeFormat(undefined, { timeZone, weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
 const time = new Intl.DateTimeFormat(undefined, { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
 const from = offsetAt(startsAt, timeZone), to = offsetAt(endsAt, timeZone);
 const lastDay = calendarDay(startsAt,timeZone) === calendarDay(endsAt,timeZone) ? '' : date.format(end) + ', ';
 return date.format(start) + ' · ' + time.format(start) + ' ' + from + ' → ' + lastDay + time.format(end) + (to === from ? '' : ' ' + to) + ' · ' + timeZone;
}
export function shiftCalendarDate(date: string, days: number): string {
 const value = new Date(date + 'T12:00:00Z'); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0,10);
}
export function calendarWeek(date: string): string[] {
 const value = new Date(date + 'T12:00:00Z'); const offset = (value.getUTCDay() + 6) % 7;
 return Array.from({length:7},(_,index) => shiftCalendarDate(date,index-offset));
}