# /calendar — Compliance Deadline Calendar

View upcoming compliance deadlines and overdue items.

## Usage
- `/calendar` — Show this week's deadlines
- `/calendar month` — Show this month
- `/calendar overdue` — Show only overdue items

## Procedure

1. Import `ComplianceCalendar` from `screening/lib/compliance-calendar.mjs`
2. Initialize with register path `.screening/compliance-calendar.json`
3. If calendar is empty, call `populateStandardCalendar()` to auto-generate UAE DPMS deadlines
4. Based on command:
   - **default/week**: Filter events for next 7 days, group by urgency
   - **month**: Filter for next 30 days
   - **overdue**: Show only items past due date
5. Color-code by urgency: OVERDUE (immediate), CRITICAL (24h), URGENT (3d), UPCOMING (7d)
6. Show filing deadlines, CDD review dates, training due dates, report deadlines

## Output Format
- Urgency summary: overdue count, critical count, upcoming count
- Deadline list sorted by date, grouped by urgency level
- Each item: type, description, due date, entity (if applicable), regulation
- End with "For review by the MLRO."
