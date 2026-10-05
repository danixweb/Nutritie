// =========================================================
// PDF Module - Monthly Report & Nutritional Analysis
// =========================================================
import { Storage, CANONICAL_NUTRIENTS, normalizeNutrientName, removeDiacritics } from './storage.js';

// Standard Daily Recommended Allowances (DZR / RDA) for adult average
const DAILY_RDA = {
    "Calorii": { name: "Calorii", rda: 2000, unit: "kcal" },
    ...CANONICAL_NUTRIENTS
};

const MONTH_NAMES_RO = [
    "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
    "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"
];

const DAY_NAMES_RO = ["Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"];
const DAY_NAMES_FULL_RO = ["Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă"];

export const PDFReport = {
    // Generate full HTML report string based on selected modular options
    generateMonthlyReportHTML(year, month, options = {}) {
        const showCalendar = options.showCalendar !== undefined ? !!options.showCalendar : (options.totalsOnly ? false : true);
        const showMetabolic = options.showMetabolic !== undefined ? !!options.showMetabolic : true;
        const showNutrients = options.showNutrients !== undefined ? !!options.showNutrients : true;
        const showMedical = options.showMedical !== undefined ? !!options.showMedical : true;
        const showFoodsSummary = options.showFoodsSummary !== undefined ? !!options.showFoodsSummary : true;

        const allMeals = Storage.getMeals();
        const allActivities = Storage.getActivities();
        const healthProfile = Storage.getHealthProfile();
        const userProfile = Storage.getUserProfile();
        const userMetrics = Storage.calculateMetrics(userProfile);
        const monthName = MONTH_NAMES_RO[month];

        // Filter meals & activities for this specific month & year
        const monthlyMeals = allMeals.filter(m => {
            if (!m.date) return false;
            const d = new Date(m.date);
            return d.getFullYear() === year && d.getMonth() === month;
        });

        const monthlyActivities = allActivities.filter(a => {
            if (!a.date) return false;
            const d = new Date(a.date);
            return d.getFullYear() === year && d.getMonth() === month;
        });

        // Group meals and activities by day number (1 .. daysInMonth)
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const mealsByDay = {};
        const activitiesByDay = {};
        for (let i = 1; i <= daysInMonth; i++) {
            mealsByDay[i] = [];
            activitiesByDay[i] = [];
        }

        monthlyMeals.forEach(meal => {
            const d = new Date(meal.date);
            const dayNum = d.getDate();
            if (mealsByDay[dayNum]) {
                mealsByDay[dayNum].push(meal);
            }
        });

        monthlyActivities.forEach(act => {
            const d = new Date(act.date);
            const dayNum = d.getDate();
            if (activitiesByDay[dayNum]) {
                activitiesByDay[dayNum].push(act);
            }
        });

        // Identify interval between first and last day with logged meals
        const daysWithMealsList = [];
        for (let i = 1; i <= daysInMonth; i++) {
            if (mealsByDay[i] && mealsByDay[i].length > 0) {
                daysWithMealsList.push(i);
            }
        }

        const hasMealsInMonth = daysWithMealsList.length > 0;
        const firstMealDay = hasMealsInMonth ? daysWithMealsList[0] : 1;
        const lastMealDay = hasMealsInMonth ? daysWithMealsList[daysWithMealsList.length - 1] : daysInMonth;
        const daysInReportInterval = hasMealsInMonth ? (lastMealDay - firstMealDay + 1) : 0;
        const intervalTitleText = hasMealsInMonth 
            ? `${String(firstMealDay).padStart(2, '0')} - ${String(lastMealDay).padStart(2, '0')} ${monthName} ${year}` 
            : `${monthName} ${year}`;

        // Aggregated monthly nutrients and metabolic data
        const monthlyNutrients = {};
        let totalMonthlyCalories = 0;
        const baseBmr = userMetrics.bmr || 1600;

        // Daily Metabolic Data calculation for all days of the month
        const dailyMetabolicStats = [];

        for (let d = 1; d <= daysInMonth; d++) {
            const dayMeals = mealsByDay[d];
            const dayActs = activitiesByDay[d];
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dateObj = new Date(year, month, d);
            const dayOfWeekName = DAY_NAMES_FULL_RO[dateObj.getDay()];

            let dayCals = 0;
            let dayProtein = 0;
            let dayCarbs = 0;
            let dayFat = 0;
            const dayFoods = [];

            dayMeals.forEach(meal => {
                (meal.foods || []).forEach(f => {
                    const cals = parseFloat(f.calories) || 0;
                    dayCals += cals;
                    dayFoods.push(f);
                    totalMonthlyCalories += cals;

                    (f.nutrients || []).forEach(n => {
                        const rawName = n.name || 'Altele';
                        const nName = normalizeNutrientName(rawName);
                        const nLower = nName.toLowerCase();
                        const q = parseFloat(n.qty) || 0;
                        if (nLower.includes('prot')) dayProtein += q;
                        if (nLower.includes('carb') || nLower.includes('gluc')) dayCarbs += q;
                        if (nLower.includes('grăs') || nLower.includes('gras') || nLower.includes('fat') || nLower.includes('lipid')) dayFat += q;

                        const def = CANONICAL_NUTRIENTS[nName];
                        const unit = def ? def.unit : (n.unit || 'g');
                        const type = def ? def.type : (n.type || 'Micro');

                        if (!monthlyNutrients[nName]) {
                            monthlyNutrients[nName] = {
                                name: nName,
                                totalQty: 0,
                                unit: unit,
                                type: type
                            };
                        }
                        monthlyNutrients[nName].totalQty += q;
                    });
                });
            });

            // Sport & Activities Burned calculation
            let daySportBurned = 0;
            let daySportDuration = 0;
            dayActs.forEach(act => {
                const cals = parseFloat(act.caloriesBurned) || 0;
                daySportBurned += cals;
                daySportDuration += (parseInt(act.durationMinutes) || 0);
            });

            // Thermal & TEF (TEF intra in calcul STRICT doar daca a avut loc o masa)
            const seasonInfo = Storage.calculateClimateFactor('auto', dateStr);
            const climateFactor = seasonInfo.factor || 1.0;
            const adjustedBmr = Math.round(baseBmr * climateFactor);
            const dayTEF = (dayCals > 0 && dayFoods.length > 0) ? Storage.calculateTEF(dayFoods) : (dayCals > 0 ? Storage.calculateTEF(dayCals) : 0);

            const dayTotalExpenditure = adjustedBmr + dayTEF + daySportBurned;
            const dayNetBalance = dayCals - dayTotalExpenditure;
            const hasData = (dayMeals.length > 0 || dayActs.length > 0);

            dailyMetabolicStats.push({
                dayNum: d,
                dateStr,
                dayOfWeekName,
                dayCals,
                dayProtein,
                dayCarbs,
                dayFat,
                dayActs,
                daySportBurned,
                daySportDuration,
                baseBmr,
                adjustedBmr,
                climateFactor,
                seasonName: seasonInfo.name,
                dayTEF,
                dayTotalExpenditure,
                dayNetBalance,
                hasData
            });
        }

        // Interval specific metabolic aggregations (between firstMealDay and lastMealDay)
        let intervalCalories = 0;
        let intervalBmr = 0;
        let intervalTef = 0;
        let intervalBurnedSport = 0;
        let intervalExpended = 0;
        let intervalNetBalance = 0;

        if (hasMealsInMonth) {
            for (let d = firstMealDay; d <= lastMealDay; d++) {
                const s = dailyMetabolicStats[d - 1];
                intervalCalories += s.dayCals;
                intervalBmr += s.adjustedBmr;
                intervalTef += s.dayTEF;
                intervalBurnedSport += s.daySportBurned;
                intervalExpended += s.dayTotalExpenditure;
                intervalNetBalance += s.dayNetBalance;
            }
        }

        // =========================================================================
        // 1) Build Calendar Grid (Weeks & 7 Columns: Mon - Sun)
        // =========================================================================
        let calendarGridHTML = '';
        if (showCalendar) {
            const firstDayObj = new Date(year, month, 1);
            let firstDayOfWeek = firstDayObj.getDay(); // 0 is Sun, 1 is Mon
            firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // 0 is Mon, 6 is Sun

            let currentDay = 1;
            let weekIndex = 1;

            while (currentDay <= daysInMonth) {
                calendarGridHTML += `<div class="week-row">`;
                for (let dayCol = 0; dayCol < 7; dayCol++) {
                    if ((weekIndex === 1 && dayCol < firstDayOfWeek) || currentDay > daysInMonth) {
                        calendarGridHTML += `<div class="day-cell empty-cell"></div>`;
                    } else {
                        const dayMeals = mealsByDay[currentDay];
                        const dayActs = activitiesByDay[currentDay];
                        const stat = dailyMetabolicStats[currentDay - 1];

                        let mealsListHTML = '';
                        if (dayMeals.length === 0 && dayActs.length === 0) {
                            mealsListHTML = `<div class="no-meals">- Fără înregistrări -</div>`;
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

                            if (dayActs.length > 0) {
                                mealsListHTML += `
                                    <div class="meal-block" style="border-left: 2px solid #10b981; background: #f0fdf4;">
                                        <div class="meal-header" style="color: #047857;">
                                            <strong>🏃 Activități & Sport (${dayActs.length})</strong>
                                            <span class="meal-cal-badge" style="background:#059669; color:white;">-${stat.daySportBurned} kcal</span>
                                        </div>
                                        <div class="foods-row" style="color:#065f46;">
                                            ${dayActs.map(a => `${a.time ? `[${a.time}] ` : ''}${a.name} (${a.durationMinutes}m)`).join(', ')}
                                        </div>
                                    </div>
                                `;
                            }
                        }

                        const isToday = (new Date().getFullYear() === year && new Date().getMonth() === month && new Date().getDate() === currentDay);

                        let balanceBadgeHTML = '';
                        if (stat && stat.hasData) {
                            const sign = stat.dayNetBalance > 0 ? '+' : '';
                            const isSurplus = stat.dayNetBalance > 0;
                            const isDeficit = stat.dayNetBalance < 0;
                            const badgeBg = isSurplus ? '#fff1f2' : (isDeficit ? '#ecfdf5' : '#f1f5f9');
                            const badgeColor = isSurplus ? '#be123c' : (isDeficit ? '#047857' : '#475569');
                            const badgeBorder = isSurplus ? '#fecdd3' : (isDeficit ? '#a7f3d0' : '#cbd5e1');

                            balanceBadgeHTML = `<span class="day-cal-total" style="background:${badgeBg}; color:${badgeColor}; border:1px solid ${badgeBorder}; padding:1px 3px; border-radius:2px; font-weight:800; font-size:7.5px; font-family:monospace;" title="Balanță: Aport ${stat.dayCals} kcal - Consum ${stat.dayTotalExpenditure} kcal">${sign}${stat.dayNetBalance} kcal</span>`;
                        }

                        calendarGridHTML += `
                            <div class="day-cell ${isToday ? 'current-day-cell' : ''}">
                                <div class="day-header">
                                    <span class="day-num">${currentDay}</span>
                                    <span class="day-name">${DAY_NAMES_RO[dayCol]}</span>
                                    ${balanceBadgeHTML}
                                </div>
                                <div class="day-content">
                                    ${mealsListHTML}
                                </div>
                                <div class="day-footer-total">
                                    <div class="tot-label">TOTAL ZI:</div>
                                    <div class="tot-macros">
                                        <b>${stat.dayCals}</b> kcal • P:<b>${stat.dayProtein.toFixed(0)}g</b> C:<b>${stat.dayCarbs.toFixed(0)}g</b> G:<b>${stat.dayFat.toFixed(0)}g</b>
                                        ${stat.daySportBurned > 0 ? `<br><span style="color:#059669; font-weight:bold;">🏃 Efort: -${stat.daySportBurned} kcal</span>` : ''}
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
        }

        // =========================================================================
        // 2) Build Daily Metabolic Balance Table (ONLY days between firstMealDay & lastMealDay)
        // =========================================================================
        let metabolicRowsHTML = '';
        let metabolicFooterHTML = '';

        if (showMetabolic) {
            if (!hasMealsInMonth) {
                metabolicRowsHTML = `<tr><td colspan="8" style="text-align:center; padding:12px; color:#94a3b8; font-style:italic;">Nu există mese înregistrate în această lună pentru a calcula balanța metabolică.</td></tr>`;
            } else {
                // Render strictly rows between firstMealDay and lastMealDay
                for (let d = firstMealDay; d <= lastMealDay; d++) {
                    const stat = dailyMetabolicStats[d - 1];
                    let statusBadge = '<span class="badge-neutral">-</span>';
                    let netFormatted = '-';

                    if (stat.hasData) {
                        const sign = stat.dayNetBalance > 0 ? '+' : '';
                        netFormatted = `<b>${sign}${stat.dayNetBalance} kcal</b>`;

                        if (stat.dayNetBalance < -500) {
                            statusBadge = `<span class="badge-opt">▼ Deficit Accentuat (${stat.dayNetBalance} kcal)</span>`;
                        } else if (stat.dayNetBalance <= -150) {
                            statusBadge = `<span class="badge-opt">▼ Deficit Optim (${stat.dayNetBalance} kcal)</span>`;
                        } else if (stat.dayNetBalance <= 150) {
                            statusBadge = `<span class="badge-neutral" style="background:#e0f2fe; color:#0369a1; border: 1px solid #bae6fd;">✓ Echilibru / Menținere</span>`;
                        } else if (stat.dayNetBalance <= 500) {
                            statusBadge = `<span class="badge-high">▲ Surplus Ușor (+${stat.dayNetBalance} kcal)</span>`;
                        } else {
                            statusBadge = `<span class="badge-def">▲ Surplus Mare (+${stat.dayNetBalance} kcal)</span>`;
                        }
                    }

                    const seasonTag = stat.climateFactor > 1.0 ? `<small style="color:#64748b; font-size:6.5px;"> (${stat.seasonName} +${Math.round((stat.climateFactor - 1) * 100)}%)</small>` : '';
                    const sportTag = stat.daySportBurned > 0 ? `<div style="font-size:6.5px; color:#059669;">${stat.dayActs.map(a => `${a.time ? `${a.time} ` : ''}${a.name}`).join(', ')} (${stat.daySportDuration}m)</div>` : '';

                    metabolicRowsHTML += `
                        <tr>
                            <td class="nut-name"><strong>${String(stat.dayNum).padStart(2, '0')} ${monthName}</strong> <span class="text-muted">(${stat.dayOfWeekName})</span></td>
                            <td class="num ${stat.dayCals > 0 ? 'font-bold' : 'text-muted'}">${stat.dayCals > 0 ? `${stat.dayCals} kcal` : '0 kcal'}</td>
                            <td class="num text-muted">${stat.adjustedBmr} kcal${seasonTag}</td>
                            <td class="num text-muted">${stat.dayTEF} kcal</td>
                            <td class="num ${stat.daySportBurned > 0 ? 'font-bold' : 'text-muted'}" style="${stat.daySportBurned > 0 ? 'color:#059669;' : ''}">
                                ${stat.daySportBurned > 0 ? `-${stat.daySportBurned} kcal` : '0 kcal'}
                                ${sportTag}
                            </td>
                            <td class="num font-bold" style="color:#1e1b4b;">${stat.dayTotalExpenditure} kcal</td>
                            <td class="num" style="${stat.dayNetBalance > 0 ? 'color:#b91c1c;' : (stat.dayNetBalance < 0 ? 'color:#15803d;' : '')}">
                                ${netFormatted}
                            </td>
                            <td class="status-cell">${statusBadge}</td>
                        </tr>
                    `;
                }

                // Total & Average Rows for the specific interval
                const avgDailyConsumed = Math.round(intervalCalories / daysInReportInterval);
                const avgDailyBmr = Math.round(intervalBmr / daysInReportInterval);
                const avgDailyTef = Math.round(intervalTef / daysInReportInterval);
                const avgDailySport = Math.round(intervalBurnedSport / daysInReportInterval);
                const avgDailyExpenditure = Math.round(intervalExpended / daysInReportInterval);
                const avgDailyNet = Math.round(intervalNetBalance / daysInReportInterval);

                metabolicFooterHTML = `
                    <tr style="background: #f1f5f9; font-weight: bold; border-top: 2px solid #cbd5e1; border-bottom: 1px solid #cbd5e1;">
                        <td class="nut-name" style="font-size: 8.5px; color: #0f172a;"><strong>TOTAL INTERVAL (${daysInReportInterval} zile: ${firstMealDay}-${lastMealDay} ${monthName})</strong></td>
                        <td class="num" style="font-size: 8.5px; color: #4338ca;">${intervalCalories} kcal</td>
                        <td class="num" style="font-size: 8.5px;">${intervalBmr} kcal</td>
                        <td class="num" style="font-size: 8.5px;">${intervalTef} kcal</td>
                        <td class="num" style="font-size: 8.5px; color: #059669;">-${intervalBurnedSport} kcal</td>
                        <td class="num" style="font-size: 8.5px; color: #0f172a;">${intervalExpended} kcal</td>
                        <td class="num" style="font-size: 8.5px; color: ${intervalNetBalance >= 0 ? '#b91c1c' : '#15803d'};">
                            ${intervalNetBalance >= 0 ? '+' : ''}${intervalNetBalance} kcal
                        </td>
                        <td class="status-cell">
                            <span class="${intervalNetBalance <= 0 ? 'badge-opt' : 'badge-def'}">
                                ${intervalNetBalance <= 0 ? `Deficit Total (${Math.abs(intervalNetBalance)} kcal)` : `Surplus Total (+${intervalNetBalance} kcal)`}
                            </span>
                        </td>
                    </tr>
                    <tr style="background: #ffffff; font-weight: 600; border-bottom: 2px solid #94a3b8;">
                        <td class="nut-name" style="color: #475569;"><strong>MEDIE ZILNICĂ INTERVAL (${daysInReportInterval} zile)</strong></td>
                        <td class="num" style="color: #4338ca;">${avgDailyConsumed} kcal/zi</td>
                        <td class="num">${avgDailyBmr} kcal/zi</td>
                        <td class="num">${avgDailyTef} kcal/zi</td>
                        <td class="num" style="color: #059669;">-${avgDailySport} kcal/zi</td>
                        <td class="num">${avgDailyExpenditure} kcal/zi</td>
                        <td class="num" style="color: ${avgDailyNet >= 0 ? '#b91c1c' : '#15803d'};">
                            ${avgDailyNet >= 0 ? '+' : ''}${avgDailyNet} kcal/zi
                        </td>
                        <td class="status-cell">
                            <small style="color: #64748b; font-weight: bold;">TDEE Țintă: ${userMetrics.targetCalories || 2000} kcal</small>
                        </td>
                    </tr>
                `;
            }
        }

        // =========================================================================
        // 3) Build Nutrient Needs vs Consumed Analysis Table (Necesar Total Interval)
        // =========================================================================
        let nutrientRowsHTML = '';
        const allTrackedKeys = new Set([...Object.keys(DAILY_RDA), ...Object.keys(monthlyNutrients)]);
        const criticalAlerts = [];
        const intervalDaysCount = daysInReportInterval > 0 ? daysInReportInterval : 1;

        allTrackedKeys.forEach(nutName => {
            const rdaInfo = DAILY_RDA[nutName];
            const loggedInfo = monthlyNutrients[nutName];

            const unit = rdaInfo ? rdaInfo.unit : (loggedInfo ? loggedInfo.unit : 'g');
            let totalConsumed = 0;
            if (nutName === "Calorii") totalConsumed = totalMonthlyCalories;
            else if (loggedInfo) totalConsumed = loggedInfo.totalQty;

            const dailyAvg = hasMealsInMonth ? (totalConsumed / intervalDaysCount) : 0;
            const rdaDaily = rdaInfo ? (rdaInfo.rda || rdaInfo.qty) : null;
            const rdaInterval = (rdaDaily && hasMealsInMonth) ? (rdaDaily * intervalDaysCount) : null;
            const percentDaily = (rdaDaily && hasMealsInMonth) ? ((dailyAvg / rdaDaily) * 100) : null;

            let statusBadge = '<span class="badge-neutral">-</span>';
            let rowStyle = '';

            if (percentDaily !== null && hasMealsInMonth) {
                if (totalConsumed === 0 || percentDaily === 0) {
                    statusBadge = '<span class="badge-critical">🚨 Lipsă Totală (0%)</span>';
                    rowStyle = 'background-color: #fff1f2;';
                    criticalAlerts.push({ 
                        name: nutName, 
                        type: 'total_lack', 
                        message: `Lipsă totală înregistrată pe intervalul ${firstMealDay}-${lastMealDay} ${monthName} (0 ${unit} din ${rdaDaily} ${unit}/zi recomandat).` 
                    });
                } else if (percentDaily < 50) {
                    const deficitPercent = Math.max(0, 100 - percentDaily);
                    statusBadge = `<span class="badge-critical">⚠️ Deficit Sever (-${deficitPercent.toFixed(0)}%)</span>`;
                    rowStyle = 'background-color: #fff7ed;';
                    criticalAlerts.push({ 
                        name: nutName, 
                        type: 'severe', 
                        message: `Nivel critic scăzut (${dailyAvg.toFixed(1)} ${unit}/zi vs ${rdaDaily} ${unit}/zi DZR - acoperire doar ${percentDaily.toFixed(0)}% pe intervalul de ${intervalDaysCount} zile).` 
                    });
                } else if (percentDaily < 85) {
                    const deficitPercent = Math.max(0, 100 - percentDaily);
                    statusBadge = `<span class="badge-def">▼ Deficit (-${deficitPercent.toFixed(0)}%)</span>`;
                } else if (percentDaily <= 120) {
                    statusBadge = '<span class="badge-opt">✓ Optim</span>';
                } else {
                    const surplusPercent = percentDaily - 100;
                    statusBadge = `<span class="badge-high">▲ Peste DZR (+${surplusPercent.toFixed(0)}%)</span>`;
                }
            }

            if (showNutrients) {
                nutrientRowsHTML += `
                    <tr style="${rowStyle}">
                        <td class="nut-name"><strong>${nutName}</strong></td>
                        <td class="num">${totalConsumed.toFixed(1)} ${unit}</td>
                        <td class="num font-bold">${dailyAvg.toFixed(1)} ${unit}</td>
                        <td class="num text-muted">${rdaDaily ? `${rdaDaily} ${unit}` : 'N/A'}</td>
                        <td class="num text-muted">${rdaInterval ? `${rdaInterval.toFixed(0)} ${unit}` : 'N/A'}</td>
                        <td class="num">${percentDaily !== null ? `<b>${percentDaily.toFixed(0)}%</b>` : '-'}</td>
                        <td class="status-cell">${statusBadge}</td>
                    </tr>
                `;
            }
        });

        // =========================================================================
        // 5) Build Aggregated Consumed Foods Summary Table (Lista Alimente Consumate)
        // =========================================================================
        let foodsSummaryRowsHTML = '';
        let foodsSummaryFooterHTML = '';
        let totalUniqueFoodsCount = 0;
        let totalServingsCount = 0;
        let totalAggregatedFoodCals = 0;
        let totalAggregatedFoodProt = 0;
        let totalAggregatedFoodCarb = 0;
        let totalAggregatedFoodFat = 0;
        let totalAggregatedFoodFiber = 0;

        if (showFoodsSummary) {
            const foodsMap = new Map();

            monthlyMeals.forEach(meal => {
                (meal.foods || []).forEach(f => {
                    const rawName = (f.name || 'Aliment nespecificat').trim();
                    const normKey = removeDiacritics(rawName);
                    const cals = parseFloat(f.calories) || 0;
                    const qty = parseFloat(f.quantity) || 0;
                    const unit = f.unit || 'g';

                    let fProt = 0;
                    let fCarb = 0;
                    let fFat = 0;
                    let fFib = 0;

                    (f.nutrients || []).forEach(n => {
                        const nName = normalizeNutrientName(n.name || '');
                        const nLower = nName.toLowerCase();
                        const q = parseFloat(n.qty) || 0;
                        if (nLower.includes('prot')) fProt += q;
                        if (nLower.includes('carb') || nLower.includes('gluc')) fCarb += q;
                        if (nLower.includes('grăs') || nLower.includes('gras') || nLower.includes('fat') || nLower.includes('lipid')) fFat += q;
                        if (nLower.includes('fibr') || nLower.includes('fiber')) fFib += q;
                    });

                    if (!foodsMap.has(normKey)) {
                        foodsMap.set(normKey, {
                            displayName: rawName,
                            totalQty: 0,
                            unit: unit,
                            mealCount: 0,
                            totalCalories: 0,
                            totalProtein: 0,
                            totalCarbs: 0,
                            totalFat: 0,
                            totalFiber: 0
                        });
                    }

                    const item = foodsMap.get(normKey);
                    item.totalQty += qty;
                    item.mealCount += 1;
                    item.totalCalories += cals;
                    item.totalProtein += fProt;
                    item.totalCarbs += fCarb;
                    item.totalFat += fFat;
                    item.totalFiber += fFib;

                    totalServingsCount += 1;
                    totalAggregatedFoodCals += cals;
                    totalAggregatedFoodProt += fProt;
                    totalAggregatedFoodCarb += fCarb;
                    totalAggregatedFoodFat += fFat;
                    totalAggregatedFoodFiber += fFib;
                });
            });

            const sortedFoods = Array.from(foodsMap.values()).sort((a, b) => b.totalCalories - a.totalCalories || b.mealCount - a.mealCount);
            totalUniqueFoodsCount = sortedFoods.length;

            if (sortedFoods.length === 0) {
                foodsSummaryRowsHTML = `<tr><td colspan="9" style="text-align:center; padding:12px; color:#94a3b8; font-style:italic;">Nu există alimente înregistrate în această lună.</td></tr>`;
            } else {
                sortedFoods.forEach((f, idx) => {
                    const calPct = totalMonthlyCalories > 0 ? ((f.totalCalories / totalMonthlyCalories) * 100).toFixed(1) : '0.0';
                    foodsSummaryRowsHTML += `
                        <tr>
                            <td class="nut-name"><strong>${idx + 1}. ${f.displayName}</strong></td>
                            <td class="num font-bold">${f.totalQty > 0 ? `${f.totalQty.toFixed(0)} ${f.unit}` : '-'}</td>
                            <td class="num" style="text-align: center;"><span class="badge-neutral" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; border-radius:3px; padding:1px 4px; font-weight:700;">${f.mealCount}x</span></td>
                            <td class="num font-bold" style="color:#4338ca;">${Math.round(f.totalCalories)} kcal</td>
                            <td class="num">${f.totalProtein.toFixed(1)} g</td>
                            <td class="num">${f.totalCarbs.toFixed(1)} g</td>
                            <td class="num">${f.totalFat.toFixed(1)} g</td>
                            <td class="num">${f.totalFiber.toFixed(1)} g</td>
                            <td class="num font-bold" style="text-align: right; color:#334155;">${calPct}%</td>
                        </tr>
                    `;
                });

                foodsSummaryFooterHTML = `
                    <tr style="background: #f1f5f9; font-weight: bold; border-top: 2px solid #cbd5e1; border-bottom: 2px solid #94a3b8;">
                        <td class="nut-name" style="font-size: 8.5px; color: #0f172a;"><strong>TOTAL (${totalUniqueFoodsCount} alimente unice)</strong></td>
                        <td class="num" style="font-size: 8.5px;">-</td>
                        <td class="num" style="text-align: center; font-size: 8.5px; color:#475569;">${totalServingsCount} mese/porții</td>
                        <td class="num font-bold" style="font-size: 8.5px; color: #4338ca;">${Math.round(totalAggregatedFoodCals)} kcal</td>
                        <td class="num" style="font-size: 8.5px;">${totalAggregatedFoodProt.toFixed(1)} g</td>
                        <td class="num" style="font-size: 8.5px;">${totalAggregatedFoodCarb.toFixed(1)} g</td>
                        <td class="num" style="font-size: 8.5px;">${totalAggregatedFoodFat.toFixed(1)} g</td>
                        <td class="num" style="font-size: 8.5px;">${totalAggregatedFoodFiber.toFixed(1)} g</td>
                        <td class="num font-bold" style="text-align: right; font-size: 8.5px; color:#4338ca;">100%</td>
                    </tr>
                `;
            }
        }

        // Biometric Profile Overview Bar
        const genderLabel = userProfile.gender === 'female' ? 'Feminin' : (userProfile.gender === 'male' ? 'Masculin' : 'Nespecificat');
        const biometricsBarHTML = `
            <div class="biometrics-bar">
                <div class="bio-item">Vârstă: <b>${userProfile.age ? `${userProfile.age} ani` : '-'}</b></div>
                <div class="bio-item">Sex: <b>${genderLabel}</b></div>
                <div class="bio-item">Înălțime: <b>${userProfile.height ? `${userProfile.height} cm` : '-'}</b></div>
                <div class="bio-item">Greutate: <b>${userProfile.weight ? `${userProfile.weight} kg` : '-'}</b></div>
                <div class="bio-item">IMC: <b>${userMetrics.imc ? `${userMetrics.imc} (${userMetrics.imcCategory})` : '-'}</b></div>
                <div class="bio-item">BMR Bazal: <b>${baseBmr} kcal/zi</b></div>
                <div class="bio-item">TDEE Țintă: <b>${userMetrics.targetCalories || 2000} kcal/zi</b></div>
            </div>
        `;

        // Assemble Sections Array dynamically
        const sectionBlocks = [];

        // 1. Calendar Grid Section
        if (showCalendar) {
            sectionBlocks.push(`
                <!-- Column Headers (7 Days of Week) -->
                <div class="week-header-row">
                    ${DAY_NAMES_RO.map(d => `<div class="col-header">${d}</div>`).join('')}
                </div>

                <!-- Monthly 7-Column Calendar Grid -->
                <div class="calendar-grid">
                    ${calendarGridHTML}
                </div>
            `);
        }

        // 2. Metabolic Balance Table Section
        if (showMetabolic) {
            const needsPageBreak = sectionBlocks.length > 0;
            sectionBlocks.push(`
                <div class="summary-section ${needsPageBreak ? 'page-break' : ''}">
                    <div class="section-header" style="background: #1e1b4b;">
                        <h2>⚡ Tabel Balanță Metabolică & Cheltuieli Energetice (${intervalTitleText})</h2>
                        <span>Interval activ: zilele ${hasMealsInMonth ? `${firstMealDay} - ${lastMealDay}` : '-'} • Metabolism Bazal + Activitate Fizică + TEF</span>
                    </div>
                    <table class="summary-table">
                        <thead>
                            <tr>
                                <th>Ziua / Data</th>
                                <th style="text-align: right;">Aport Ingerat (Consumat)</th>
                                <th style="text-align: right;">BMR Bazal (Ajustat)</th>
                                <th style="text-align: right;">Digestie (TEF ~10%)</th>
                                <th style="text-align: right;">Activitate Fizică / Sport</th>
                                <th style="text-align: right;">Necesar Total (Consum)</th>
                                <th style="text-align: right;">Balanță Netă (Diferență)</th>
                                <th style="text-align: center;">Evaluare & Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${metabolicRowsHTML}
                        </tbody>
                        <tfoot>
                            ${metabolicFooterHTML}
                        </tfoot>
                    </table>
                </div>
            `);
        }

        // 3. Nutrient Needs Table Section (Necesar Total Interval)
        if (showNutrients) {
            const needsPageBreak = sectionBlocks.length > 0 && !showMetabolic;
            sectionBlocks.push(`
                <div class="summary-section ${needsPageBreak ? 'page-break' : ''}">
                    <div class="section-header">
                        <h2>🔬 Raport Necesar Nutrițional vs Cantitate Consumată (${intervalTitleText})</h2>
                        <span>Analiză raportată la Doza Zilnică Recomandată (DZR / RDA) pe intervalul de ${intervalDaysCount} zile</span>
                    </div>
                    <table class="summary-table">
                        <thead>
                            <tr>
                                <th>Nutrient</th>
                                <th style="text-align: right;">Total Consumat</th>
                                <th style="text-align: right;">Medie / Zi Interval</th>
                                <th style="text-align: right;">DZR Zilnic Recomandat</th>
                                <th style="text-align: right;">Necesar Total Interval</th>
                                <th style="text-align: right;">% Realizat / Zi</th>
                                <th style="text-align: center;">Evaluare Balanță</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${nutrientRowsHTML}
                        </tbody>
                    </table>
                </div>
            `);
        }

        // 4. Medical Warnings & Health Profile Section
        if (showMedical) {
            sectionBlocks.push(`
                ${criticalAlerts.length > 0 ? `
                <div style="margin-top: 8px; padding: 6px 10px; background: #fff1f2; border: 1.5px solid #fda4af; border-radius: 6px; page-break-inside: avoid;">
                    <div style="font-size: 8.5px; font-weight: 800; color: #9f1239; margin-bottom: 3px; display: flex; align-items: center; gap: 4px;">
                        <span>🚨 ATENȚIE MEDICALĂ / NUTRIȚIONALĂ: Carențe & Niveluri Critice Înregistrate (${criticalAlerts.length})</span>
                    </div>
                    <ul style="margin: 0; padding-left: 14px; font-size: 7.5px; color: #881337; line-height: 1.35;">
                        ${criticalAlerts.map(a => `<li><strong>${a.name}:</strong> ${a.message}</li>`).join('')}
                    </ul>
                </div>
                ` : `
                <div style="margin-top: 8px; padding: 4px 10px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 4px; font-size: 7.5px; color: #166534;">
                    <strong>✓ Atenție Medicală - Niciun deficit critic detectat:</strong> Toți micronutrienții esențiali au un aport înregistrat de peste 50% din DZR recomandat pe intervalul activ.
                </div>
                `}

                ${healthProfile.length > 0 ? `
                <div style="margin-top: 8px; padding: 5px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 7.5px; color: #334155;">
                    <strong>🩺 Profil Medical / Afecțiuni Declarate:</strong> ${healthProfile.join(', ')}
                </div>
                ` : ''}
            `);
        }

        // 5. Aggregated Foods Summary Table Section
        if (showFoodsSummary) {
            const needsPageBreak = sectionBlocks.length > 0;
            sectionBlocks.push(`
                <div class="summary-section ${needsPageBreak ? 'page-break' : ''}">
                    <div class="section-header" style="background: #064e3b;">
                        <h2>🥗 Lista Alimente Consumate & Totaluri Agregate (${totalUniqueFoodsCount} alimente)</h2>
                        <span>Totaluri cantitative, frecvență de consum, aport caloric și macronutrienți pe intervalul ${intervalTitleText}</span>
                    </div>
                    <table class="summary-table">
                        <thead>
                            <tr>
                                <th>Aliment</th>
                                <th style="text-align: right;">Cantitate Totală</th>
                                <th style="text-align: center;">Frecvență Mese</th>
                                <th style="text-align: right;">Total Calorii</th>
                                <th style="text-align: right;">Proteine</th>
                                <th style="text-align: right;">Carbohidrați</th>
                                <th style="text-align: right;">Grăsimi</th>
                                <th style="text-align: right;">Fibre</th>
                                <th style="text-align: right;">% Pondere Calorii</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${foodsSummaryRowsHTML}
                        </tbody>
                        <tfoot>
                            ${foodsSummaryFooterHTML}
                        </tfoot>
                    </table>
                </div>
            `);
        }

        if (sectionBlocks.length === 0) {
            sectionBlocks.push(`
                <div style="padding: 40px; text-align: center; color: #64748b; font-size: 11px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; margin-top:20px;">
                    <p style="font-size:14px; font-weight:bold; color:#334155; margin-bottom:6px;">Nicio secțiune selectată</p>
                    <p>Selectează cel puțin o secțiune din fereastra de configurare a raportului PDF pentru a vizualiza datele.</p>
                </div>
            `);
        }

        // Assemble Full Document HTML
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Raport Nutrițional - ${intervalTitleText}</title>
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
                    margin-bottom: 6px;
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
                    flex-wrap: wrap;
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

                /* Biometrics Bar */
                .biometrics-bar {
                    display: flex;
                    gap: 8px;
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 4px;
                    padding: 4px 8px;
                    margin-bottom: 8px;
                    font-size: 7.5px;
                    color: #475569;
                    flex-wrap: wrap;
                }
                .bio-item b {
                    color: #0f172a;
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
                    margin-top: 8px;
                    border: 1px solid #cbd5e1;
                    border-radius: 6px;
                    overflow: hidden;
                    page-break-inside: avoid;
                    break-inside: avoid;
                }
                .section-header {
                    background: #0f172a;
                    color: #ffffff;
                    padding: 5px 10px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .section-header h2 {
                    margin: 0;
                    font-size: 10.5px;
                    font-weight: 700;
                }
                .section-header span {
                    font-size: 8px;
                    color: #94a3b8;
                }

                table.summary-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 7.5px;
                }
                table.summary-table th {
                    background: #f1f5f9;
                    color: #334155;
                    font-weight: 700;
                    padding: 3.5px 5px;
                    text-align: left;
                    border-bottom: 1px solid #cbd5e1;
                }
                table.summary-table td {
                    padding: 3px 5px;
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
                .font-bold {
                    font-weight: 700;
                }
                .text-muted {
                    color: #64748b;
                }
                .status-cell {
                    text-align: center;
                    width: 17%;
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
                .badge-critical {
                    background: #881337;
                    color: #ffffff;
                    font-weight: 800;
                    padding: 1px 5px;
                    border-radius: 3px;
                    border: 1px solid #4c0519;
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
                    font-weight: 600;
                    padding: 1px 4px;
                }

                /* Footer */
                .report-footer {
                    margin-top: 8px;
                    display: flex;
                    justify-content: space-between;
                    font-size: 7px;
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
                        <h1>Asistent <span>Nutriție</span> — Jurnal & Raport Nutrițional</h1>
                        <p>Interval raportat: <strong>${intervalTitleText}</strong> • Activitate, aport alimentar și balanță metabolică</p>
                    </div>
                    <div class="meta-pills">
                        <div class="meta-pill">Zile cu mese: <b>${daysWithMealsList.length} / ${daysInMonth}</b></div>
                        <div class="meta-pill">Interval activ: <b>${daysInReportInterval} zile</b></div>
                        <div class="meta-pill">Consum Ingerat: <b>${totalMonthlyCalories} kcal</b></div>
                        <div class="meta-pill">Sport Arse: <b style="color:#059669;">-${intervalBurnedSport} kcal</b></div>
                        <div class="meta-pill">Necesar Interval: <b>${intervalExpended} kcal</b></div>
                        <div class="meta-pill">Balanță Netă: <b style="color:${intervalNetBalance >= 0 ? '#b91c1c' : '#15803d'};">${intervalNetBalance >= 0 ? '+' : ''}${intervalNetBalance} kcal</b></div>
                    </div>
                </div>

                <!-- Biometrics Bar -->
                ${biometricsBarHTML}

                <!-- Dynamically Rendered Report Sections -->
                ${sectionBlocks.join('\n')}

                <!-- Footer Note -->
                <div class="report-footer">
                    <div>Generat automat din <strong>Asistent Nutriție</strong> la data de: ${new Date().toLocaleString('ro-RO')}</div>
                    <div>Document confidențial generat local pe dispozitivul utilizatorului.</div>
                </div>
            </div>
        </body>
        </html>
        `;
    },

    // Open print window / Direct PDF export
    async exportToPDF(year, month, options = {}) {
        const monthName = MONTH_NAMES_RO[month];
        const htmlContent = this.generateMonthlyReportHTML(year, month, options);

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
            // High-fidelity fallback via popup print window
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
    previewReport(year, month, options = {}) {
        const htmlContent = this.generateMonthlyReportHTML(year, month, options);
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
