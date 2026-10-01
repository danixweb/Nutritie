// =========================================================
// PDF Module - Monthly Landscape Report & Nutrient Analysis
// =========================================================
import { Storage } from './storage.js';

// Standard Daily Recommended Allowances (DZR / RDA) for adult average
const DAILY_RDA = {
    "Calorii": { qty: 2000, unit: "kcal" },
    "Proteine": { qty: 75, unit: "g" },
    "Carbohidrați": { qty: 260, unit: "g" },
    "Grăsimi": { qty: 70, unit: "g" },
    "Fibre": { qty: 30, unit: "g" },
    "Vitamina C": { qty: 80, unit: "mg" },
    "Vitamina A": { qty: 800, unit: "mcg" },
    "Vitamina D": { qty: 15, unit: "mcg" },
    "Vitamina B12": { qty: 2.5, unit: "mcg" },
    "Calciu": { qty: 1000, unit: "mg" },
    "Magneziu": { qty: 375, unit: "mg" },
    "Fier": { qty: 14, unit: "mg" },
    "Potasiu": { qty: 3500, unit: "mg" },
    "Zinc": { qty: 10, unit: "mg" }
};

const MONTH_NAMES_RO = [
    "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
    "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"
];

const DAY_NAMES_RO = ["Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"];

export const PDFReport = {
    // Generate full HTML report string
    generateMonthlyReportHTML(year, month) {
        const allMeals = Storage.getMeals();
        const healthProfile = Storage.getHealthProfile();
        const monthName = MONTH_NAMES_RO[month];

        // Filter meals for this specific month & year
        const monthlyMeals = allMeals.filter(m => {
            if (!m.date) return false;
            const d = new Date(m.date);
            return d.getFullYear() === year && d.getMonth() === month;
        });

        // Group meals by day number (1 .. daysInMonth)
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const mealsByDay = {};
        for (let i = 1; i <= daysInMonth; i++) {
            mealsByDay[i] = [];
        }

        monthlyMeals.forEach(meal => {
            const d = new Date(meal.date);
            const dayNum = d.getDate();
            if (mealsByDay[dayNum]) {
                mealsByDay[dayNum].push(meal);
            }
        });

        // Aggregated monthly nutrients
        const monthlyNutrients = {};
        let totalMonthlyCalories = 0;
        let daysWithLoggedMeals = 0;

        for (let d = 1; d <= daysInMonth; d++) {
            const dayMeals = mealsByDay[d];
            if (dayMeals.length > 0) daysWithLoggedMeals++;

            dayMeals.forEach(meal => {
                (meal.foods || []).forEach(f => {
                    const cals = parseFloat(f.calories) || 0;
                    totalMonthlyCalories += cals;

                    (f.nutrients || []).forEach(n => {
                        const nName = n.name || 'Altele';
                        if (!monthlyNutrients[nName]) {
                            monthlyNutrients[nName] = {
                                name: nName,
                                totalQty: 0,
                                unit: n.unit || 'g',
                                type: n.type || 'Micro'
                            };
                        }
                        monthlyNutrients[nName].totalQty += parseFloat(n.qty) || 0;
                    });
                });
            });
        }

        // Build Calendar Grid (Weeks & 7 Columns: Mon - Sun)
        // First day of month (0 = Sunday, 1 = Monday, etc.)
        const firstDayObj = new Date(year, month, 1);
        let firstDayOfWeek = firstDayObj.getDay(); // 0 is Sun, 1 is Mon
        firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // 0 is Mon, 6 is Sun

        let calendarGridHTML = '';
        let currentDay = 1;
        let weekIndex = 1;

        while (currentDay <= daysInMonth) {
            calendarGridHTML += `<div class="week-row">`;
            for (let dayCol = 0; dayCol < 7; dayCol++) {
                if ((weekIndex === 1 && dayCol < firstDayOfWeek) || currentDay > daysInMonth) {
                    calendarGridHTML += `<div class="day-cell empty-cell"></div>`;
                } else {
                    const dayMeals = mealsByDay[currentDay];
                    let dayCalories = 0;
                    let dayProtein = 0;
                    let dayCarbs = 0;
                    let dayFat = 0;

                    let mealsListHTML = '';
                    if (dayMeals.length === 0) {
                        mealsListHTML = `<div class="no-meals">- Fără mese -</div>`;
                    } else {
                        dayMeals.forEach((m, mIdx) => {
                            let mealCals = 0;
                            let mealProt = 0;
                            let mealCarb = 0;
                            let mealFat = 0;

                            const foodsList = (m.foods || []).map(f => {
                                const cal = f.calories || 0;
                                mealCals += cal;
                                (f.nutrients || []).forEach(n => {
                                    const nLower = (n.name || '').toLowerCase();
                                    const q = parseFloat(n.qty) || 0;
                                    if (nLower.includes('prot')) mealProt += q;
                                    if (nLower.includes('carb') || nLower.includes('gluc')) mealCarb += q;
                                    if (nLower.includes('grăs') || nLower.includes('gras') || nLower.includes('fat') || nLower.includes('lipid')) mealFat += q;
                                });
                                return `<span class="food-item">${f.name} <small>(${f.quantity}${f.unit})</small></span>`;
                            }).join(', ');

                            dayCalories += mealCals;
                            dayProtein += mealProt;
                            dayCarbs += mealCarb;
                            dayFat += mealFat;

                            const mealTime = m.date ? new Date(m.date).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }) : '';
                            const mealTitle = m.name || `Masă ${mIdx + 1}`;

                            mealsListHTML += `
                                <div class="meal-block">
                                    <div class="meal-header">
                                        <strong>${mealTitle}</strong> ${mealTime ? `<span class="meal-time">${mealTime}</span>` : ''} 
                                        <span class="meal-cal-badge">${mealCals} kcal</span>
                                    </div>
                                    <div class="foods-row">${foodsList || 'Fără ingrediente'}</div>
                                    <div class="meal-macros">
                                        P: <b>${mealProt.toFixed(0)}g</b> | C: <b>${mealCarb.toFixed(0)}g</b> | G: <b>${mealFat.toFixed(0)}g</b>
                                    </div>
                                </div>
                            `;
                        });
                    }

                    const isToday = (new Date().getFullYear() === year && new Date().getMonth() === month && new Date().getDate() === currentDay);

                    calendarGridHTML += `
                        <div class="day-cell ${isToday ? 'current-day-cell' : ''}">
                            <div class="day-header">
                                <span class="day-num">${currentDay}</span>
                                <span class="day-name">${DAY_NAMES_RO[dayCol]}</span>
                                ${dayCalories > 0 ? `<span class="day-cal-total">${dayCalories} kcal</span>` : ''}
                            </div>
                            <div class="day-content">
                                ${mealsListHTML}
                            </div>
                            <div class="day-footer-total">
                                <div class="tot-label">TOTAL ZI:</div>
                                <div class="tot-macros">
                                    <b>${dayCalories}</b> kcal • P:<b>${dayProtein.toFixed(0)}g</b> C:<b>${dayCarbs.toFixed(0)}g</b> G:<b>${dayFat.toFixed(0)}g</b>
                                </div>
                            </div>
                        </div>
                    `;
                    currentDay++;
                }
            }
            calendarGridHTML += `</div>`;
            weekIndex++;
        }

        // Build Nutrient Needs vs Consumed Analysis Table (Necesar vs Consumat)
        const activeDays = daysWithLoggedMeals > 0 ? daysWithLoggedMeals : 1;
        let nutrientRowsHTML = '';

        // Add core macros first
        const coreNutrients = [
            { name: "Calorii", total: totalMonthlyCalories, unit: "kcal" },
            { name: "Proteine", total: (monthlyNutrients["Proteine"]?.totalQty || 0), unit: "g" },
            { name: "Carbohidrați", total: (monthlyNutrients["Carbohidrați"]?.totalQty || 0), unit: "g" },
            { name: "Grăsimi", total: (monthlyNutrients["Grăsimi"]?.totalQty || 0), unit: "g" }
        ];

        // Combine with micronutrients found in logs or in standard RDA
        const allTrackedKeys = new Set([...Object.keys(DAILY_RDA), ...Object.keys(monthlyNutrients)]);

        allTrackedKeys.forEach(nutName => {
            const rdaInfo = DAILY_RDA[nutName];
            const loggedInfo = monthlyNutrients[nutName];

            const unit = rdaInfo ? rdaInfo.unit : (loggedInfo ? loggedInfo.unit : 'g');
            let totalConsumed = 0;
            if (nutName === "Calorii") totalConsumed = totalMonthlyCalories;
            else if (loggedInfo) totalConsumed = loggedInfo.totalQty;

            const dailyAvg = totalConsumed / activeDays;
            const rdaDaily = rdaInfo ? rdaInfo.qty : null;
            const rdaMonthly = rdaDaily ? (rdaDaily * daysInMonth) : null;
            const percentDaily = rdaDaily ? ((dailyAvg / rdaDaily) * 100) : null;

            let statusBadge = '<span class="badge-neutral">-</span>';
            if (percentDaily !== null) {
                if (percentDaily >= 85 && percentDaily <= 120) {
                    statusBadge = '<span class="badge-opt">✓ Optim</span>';
                } else if (percentDaily < 85) {
                    statusBadge = `<span class="badge-def">▼ Deficit (${percentDaily.toFixed(0)}%)</span>`;
                } else {
                    statusBadge = `<span class="badge-high">▲ Peste DZR (${percentDaily.toFixed(0)}%)</span>`;
                }
            }

            nutrientRowsHTML += `
                <tr>
                    <td class="nut-name"><strong>${nutName}</strong></td>
                    <td class="num">${totalConsumed.toFixed(1)} ${unit}</td>
                    <td class="num font-bold">${dailyAvg.toFixed(1)} ${unit}</td>
                    <td class="num text-muted">${rdaDaily ? `${rdaDaily} ${unit}` : 'N/A'}</td>
                    <td class="num text-muted">${rdaMonthly ? `${rdaMonthly.toFixed(0)} ${unit}` : 'N/A'}</td>
                    <td class="num">${percentDaily !== null ? `<b>${percentDaily.toFixed(0)}%</b>` : '-'}</td>
                    <td class="status-cell">${statusBadge}</td>
                </tr>
            `;
        });

        // Assemble Full Document HTML
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Raport Nutrițional Lunar - ${monthName} ${year}</title>
            <style>
                @page {
                    size: A4 landscape;
                    margin: 6mm 8mm 6mm 8mm;
                }
                * {
                    box-sizing: border-box;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                body {
                    font-family: 'Segoe UI', -apple-system, Roboto, Helvetica, Arial, sans-serif;
                    background: #ffffff;
                    color: #1e293b;
                    margin: 0;
                    padding: 0;
                    font-size: 8px;
                    line-height: 1.2;
                }
                
                /* Page break management */
                .page-container {
                    width: 100%;
                }
                .page-break {
                    page-break-before: always;
                    break-before: page;
                    margin-top: 15px;
                }

                /* Header */
                .report-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 2px solid #4f46e5;
                    padding-bottom: 6px;
                    margin-bottom: 8px;
                }
                .report-title-group h1 {
                    margin: 0;
                    font-size: 16px;
                    color: #0f172a;
                    font-weight: 800;
                    letter-spacing: -0.5px;
                }
                .report-title-group h1 span {
                    color: #4f46e5;
                }
                .report-title-group p {
                    margin: 2px 0 0 0;
                    font-size: 9px;
                    color: #64748b;
                    font-weight: 600;
                }
                .meta-pills {
                    display: flex;
                    gap: 6px;
                }
                .meta-pill {
                    background: #f1f5f9;
                    border: 1px solid #cbd5e1;
                    padding: 3px 8px;
                    border-radius: 4px;
                    font-size: 8px;
                    font-weight: 600;
                    color: #334155;
                }
                .meta-pill b {
                    color: #4f46e5;
                }

                /* Week days header */
                .week-header-row {
                    display: grid;
                    grid-template-columns: repeat(7, 1fr);
                    gap: 4px;
                    margin-bottom: 4px;
                }
                .col-header {
                    background: #1e293b;
                    color: #ffffff;
                    text-align: center;
                    font-weight: 700;
                    font-size: 9px;
                    padding: 4px;
                    border-radius: 3px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                /* Calendar Grid */
                .calendar-grid {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    margin-bottom: 12px;
                }
                .week-row {
                    display: grid;
                    grid-template-columns: repeat(7, 1fr);
                    gap: 4px;
                    page-break-inside: avoid;
                    break-inside: avoid;
                }
                .day-cell {
                    border: 1px solid #cbd5e1;
                    background: #ffffff;
                    border-radius: 4px;
                    min-height: 105px;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    overflow: hidden;
                }
                .empty-cell {
                    background: #f8fafc;
                    border: 1px dashed #e2e8f0;
                }
                .current-day-cell {
                    border: 1.5px solid #4f46e5;
                    box-shadow: 0 0 0 1px #4f46e5 inset;
                }
                .day-header {
                    background: #f1f5f9;
                    border-bottom: 1px solid #e2e8f0;
                    padding: 2px 4px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 8px;
                }
                .day-num {
                    font-weight: 800;
                    font-size: 10px;
                    color: #0f172a;
                }
                .day-name {
                    color: #64748b;
                    font-weight: 600;
                    font-size: 7.5px;
                }
                .day-cal-total {
                    background: #e0e7ff;
                    color: #3730a3;
                    padding: 1px 3px;
                    border-radius: 2px;
                    font-weight: 700;
                    font-size: 7.5px;
                }

                .day-content {
                    padding: 3px;
                    flex-grow: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 3px;
                }
                .no-meals {
                    color: #94a3b8;
                    font-style: italic;
                    text-align: center;
                    padding-top: 20px;
                    font-size: 7.5px;
                }

                /* Meal Block */
                .meal-block {
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-left: 2px solid #6366f1;
                    border-radius: 2px;
                    padding: 2px 3px;
                }
                .meal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 7.5px;
                    margin-bottom: 1px;
                }
                .meal-header strong {
                    color: #1e1b4b;
                }
                .meal-time {
                    color: #64748b;
                    font-size: 7px;
                }
                .meal-cal-badge {
                    font-weight: bold;
                    color: #4338ca;
                    font-size: 7px;
                }
                .foods-row {
                    color: #334155;
                    font-size: 7px;
                    line-height: 1.1;
                    margin-bottom: 2px;
                }
                .food-item small {
                    color: #64748b;
                }
                .meal-macros {
                    font-size: 6.5px;
                    color: #475569;
                    background: #eef2ff;
                    padding: 1px 3px;
                    border-radius: 2px;
                }

                .day-footer-total {
                    background: #f8fafc;
                    border-top: 1px solid #e2e8f0;
                    padding: 2px 4px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 7px;
                }
                .tot-label {
                    font-weight: 800;
                    color: #475569;
                    font-size: 6.5px;
                }
                .tot-macros {
                    color: #0f172a;
                }

                /* Summary Table Section */
                .summary-section {
                    margin-top: 10px;
                    border: 1px solid #cbd5e1;
                    border-radius: 6px;
                    overflow: hidden;
                    page-break-inside: avoid;
                    break-inside: avoid;
                }
                .section-header {
                    background: #0f172a;
                    color: #ffffff;
                    padding: 6px 10px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .section-header h2 {
                    margin: 0;
                    font-size: 11px;
                    font-weight: 700;
                }
                .section-header span {
                    font-size: 8.5px;
                    color: #94a3b8;
                }

                table.summary-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 8px;
                }
                table.summary-table th {
                    background: #f1f5f9;
                    color: #334155;
                    font-weight: 700;
                    padding: 4px 6px;
                    text-align: left;
                    border-bottom: 1px solid #cbd5e1;
                }
                table.summary-table td {
                    padding: 3.5px 6px;
                    border-bottom: 1px solid #f1f5f9;
                    color: #1e293b;
                }
                table.summary-table tr:nth-child(even) {
                    background: #fafafa;
                }
                table.summary-table tr:hover {
                    background: #f8fafc;
                }
                .nut-name {
                    color: #0f172a;
                    width: 22%;
                }
                .num {
                    font-family: 'Consolas', monospace;
                    text-align: right;
                }
                .text-muted {
                    color: #64748b;
                }
                .status-cell {
                    text-align: center;
                    width: 16%;
                }

                .badge-opt {
                    background: #dcfce7;
                    color: #166534;
                    font-weight: 700;
                    padding: 1px 5px;
                    border-radius: 3px;
                    border: 1px solid #bbf7d0;
                }
                .badge-def {
                    background: #fee2e2;
                    color: #991b1b;
                    font-weight: 700;
                    padding: 1px 5px;
                    border-radius: 3px;
                    border: 1px solid #fecaca;
                }
                .badge-high {
                    background: #fef3c7;
                    color: #92400e;
                    font-weight: 700;
                    padding: 1px 5px;
                    border-radius: 3px;
                    border: 1px solid #fde68a;
                }
                .badge-neutral {
                    color: #94a3b8;
                }

                /* Footer */
                .report-footer {
                    margin-top: 8px;
                    display: flex;
                    justify-content: space-between;
                    font-size: 7.5px;
                    color: #94a3b8;
                    border-top: 1px solid #e2e8f0;
                    padding-top: 4px;
                }
            </style>
        </head>
        <body>
            <div class="page-container">
                <!-- Main Header -->
                <div class="report-header">
                    <div class="report-title-group">
                        <h1>Nutriție <span>Pro</span> — Jurnal Nutrițional Lunar</h1>
                        <p>Raport complet de activitate și aport nutrițional • <strong>${monthName} ${year}</strong></p>
                    </div>
                    <div class="meta-pills">
                        <div class="meta-pill">Zile înregistrate: <b>${daysWithLoggedMeals} / ${daysInMonth}</b></div>
                        <div class="meta-pill">Total Calorii: <b>${totalMonthlyCalories} kcal</b></div>
                        <div class="meta-pill">Medie Zilnică: <b>${Math.round(totalMonthlyCalories / activeDays)} kcal/zi</b></div>
                    </div>
                </div>

                <!-- Column Headers (7 Days of Week) -->
                <div class="week-header-row">
                    ${DAY_NAMES_RO.map(d => `<div class="col-header">${d}</div>`).join('')}
                </div>

                <!-- Monthly 7-Column Calendar Grid -->
                <div class="calendar-grid">
                    ${calendarGridHTML}
                </div>

                <!-- Page Break for Clear Printable Summary -->
                <div class="page-break"></div>

                <!-- End of Report: Nutrient Needs vs Consumed (Necesar / Consumat) -->
                <div class="summary-section">
                    <div class="section-header">
                        <h2>📊 Raport Necesar Nutrițional vs Cantitate Consumată</h2>
                        <span>Analiză raportată la Doza Zilnică Recomandată (DZR / RDA)</span>
                    </div>
                    <table class="summary-table">
                        <thead>
                            <tr>
                                <th>Nutrient</th>
                                <th style="text-align: right;">Total Consumat (${monthName})</th>
                                <th style="text-align: right;">Medie / Zi Înregistrată</th>
                                <th style="text-align: right;">DZR Zilnic Recomandat</th>
                                <th style="text-align: right;">Necesar Total Lună</th>
                                <th style="text-align: right;">% Realizat / Zi</th>
                                <th style="text-align: center;">Evaluare Balanță</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${nutrientRowsHTML}
                        </tbody>
                    </table>
                </div>

                <!-- Health Profile Attached (if any) -->
                ${healthProfile.length > 0 ? `
                <div style="margin-top: 8px; padding: 6px 10px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 4px; font-size: 8px; color: #9f1239;">
                    <strong>🩺 Parametri Medicali Activi:</strong> ${healthProfile.join(', ')}
                </div>
                ` : ''}

                <!-- Footer Note -->
                <div class="report-footer">
                    <div>Generat automat din <strong>Nutriție Pro 2.1</strong> la data de: ${new Date().toLocaleString('ro-RO')}</div>
                    <div>Document privat generat local pe dispozitivul utilizatorului.</div>
                </div>
            </div>
        </body>
        </html>
        `;
    },

    // Open print window / Direct PDF export
    async exportToPDF(year, month) {
        const monthName = MONTH_NAMES_RO[month];
        const htmlContent = this.generateMonthlyReportHTML(year, month);

        // Check if html2pdf is available
        if (window.html2pdf) {
            const container = document.createElement('div');
            container.innerHTML = htmlContent;
            document.body.appendChild(container);

            const opt = {
                margin: [6, 8, 6, 8],
                filename: `Raport_Nutritie_${monthName}_${year}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, logging: false },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
            };

            try {
                await window.html2pdf().set(opt).from(container).save();
            } finally {
                document.body.removeChild(container);
            }
        } else {
            // High-fidelity fallback via popup print window with landscape CSS
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                alert("Te rugăm să permiți ferestrele pop-up pentru a descărca/printa raportul PDF.");
                return;
            }
            printWindow.document.open();
            printWindow.document.write(htmlContent);
            printWindow.document.close();
            setTimeout(() => {
                printWindow.focus();
                printWindow.print();
            }, 500);
        }
    },

    // Preview in dedicated iframe modal or new tab
    previewReport(year, month) {
        const htmlContent = this.generateMonthlyReportHTML(year, month);
        const win = window.open('', '_blank');
        if (win) {
            win.document.open();
            win.document.write(htmlContent);
            win.document.close();
        } else {
            alert("Permite ferestrele pop-up pentru previzualizare.");
        }
    }
};
