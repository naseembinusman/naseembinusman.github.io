let minDB, maxDB;
let impellerDB;
let pumpsDB;


async function loadXML(path) {
    const res = await fetch(path);
    const text = await res.text();
    return new DOMParser().parseFromString(text, "text/xml");
}

// end of async function loadXML(path)

async function loadDatabases() {
    console.log("Database loading....");
    pumpsDB   = await loadXML("https://github.com/naseembinusman/naseembinusman.github.io/blob/29474ad5bf5574021bf712877924fbe450a92249/data/pumps.xml");
    minDB     = await loadXML("https://github.com/naseembinusman/naseembinusman.github.io/blob/29474ad5bf5574021bf712877924fbe450a92249/data/min.xml");
    maxDB     = await loadXML("https://github.com/naseembinusman/naseembinusman.github.io/blob/29474ad5bf5574021bf712877924fbe450a92249/data/max.xml");
    impellerDB = await loadXML("https://github.com/naseembinusman/naseembinusman.github.io/blob/f9efe18aef8aad3eea00c53ad214d0ab4763e610/data/impeller.xml");
    console.log("Database loaded!");
}

//end of async function loadDatabases() 

loadDatabases();

document.addEventListener("DOMContentLoaded", async () => {
  const flowSelect = document.getElementById("flowSelect");
  const modelSelect = document.getElementById("modelSelect");

  await loadDatabases();   // make sure everything is ready

  const flows = pumpsDB.getElementsByTagName("Flow");

  // Populate flows
  for (let flow of flows) {
    const rate = flow.getAttribute("rate");
    const opt = document.createElement("option");
    opt.value = rate;
    opt.textContent = rate;
    flowSelect.appendChild(opt);
  }

  flowSelect.addEventListener("change", () => {
    modelSelect.innerHTML = '<option value="">-- Select Pump Model --</option>';
    modelSelect.disabled = true;

    if (!flowSelect.value) return;

    for (let flow of flows) {
      if (flow.getAttribute("rate") === flowSelect.value) {
        const models = flow.getElementsByTagName("PumpModel");
        for (let m of models) {
          const opt = document.createElement("option");
          opt.value = m.textContent;
          opt.textContent = m.textContent;
          modelSelect.appendChild(opt);
        }
        modelSelect.disabled = false;
        break;
      }
    }
  });

  modelSelect.addEventListener("change", () => {
    const modelName = modelSelect.value;    
    if (!modelName) return;
    const minData = getPumpData(minDB, modelName);
    const maxData = getPumpData(maxDB, modelName);    
    showPanel();
  });
});

// end of document.addEventListener("DOMContentLoaded", async ()

function getImpellerRange(modelName) {
    if (!impellerDB) {
        console.log("Database still loading, please wait");
        return;
    }
    const pumps = impellerDB.querySelectorAll("Pump");
    for (let pump of pumps) {
        const name = pump.querySelector("Model").textContent.trim();
        if (name === modelName) {
            const dMin = parseFloat(pump.querySelector("MinImpeller").textContent);
            const dMax = parseFloat(pump.querySelector("MaxImpeller").textContent);
            return { dMin, dMax };
        }
    }
    return null;
}

// end of function getImpellerRange(modelName)

function getPumpData(xmlDoc, modelName) {
    const pump = xmlDoc.querySelector(`PumpModel[name="${modelName}"]`);
    if (!pump) {
        console.warn(`Pump ${modelName} not found`);
        return null;
    }

    const points = [];
    const dataPoints = pump.querySelectorAll("DataPoint");

    dataPoints.forEach(dp => {
        points.push({
            gpm: parseFloat(dp.querySelector("GPM").textContent),
            head: parseFloat(dp.querySelector("M").textContent),
            kw: parseFloat(dp.querySelector("KW").textContent)
        });
    });

    return points;
}

// end of function getPumpData(xmlDoc, modelName)

function showPanel() {
    const panel = document.getElementById("inputPanel");

    panel.classList.add("show");

    // Optional: set default RPM only after showing
    const rpmInput = document.getElementById("ratedRPM");
    if (!rpmInput.value) rpmInput.value = 2900;
}

// end of function showPanel()

const HIGH_SPEED_PUMPS = [
    "EHES425250",
    "EHES53250",
    "EHES54200",
    "EHES64200",
    "FK150-290-60"
];

function getBaseSpeed(model) {
    return HIGH_SPEED_PUMPS.includes(model) ? 3550 : 2900;
}

function headToMeter(value, unit) {
    if (unit === "bar") return value * 10.197;
    if (unit === "psi") return value * 0.703;
    return value;
}

function meterToUnit(value, unit) {
    if (unit === "bar") return value / 10.197;
    if (unit === "psi") return value / 0.703;
    return value;
}

function interpolate(x, x1, y1, x2, y2) {    
    const m = y1 + ((x - x1) * (y2 - y1)) / (x2 - x1);        
    return m;
}

function getValueAtFlow(curve, flow, key) {    
    for (let i = 0; i < curve.length - 1; i++) {        
        if (flow >= curve[i].gpm && flow <= curve[i + 1].gpm) {            
            return interpolate(flow, curve[i].gpm, curve[i][key], curve[i + 1].gpm, curve[i + 1][key]);
        }
    }
    console.warn("Flow outside curve range");
    return null;
}

// end of function getValueAtFlow(curve, flow, key)

function calculateImpellerDiameter(targetHead, minHead, maxHead, dMin, dMax) {    
    const ratio = (targetHead - minHead) / (maxHead - minHead);
    if (ratio < 0 || ratio > 1) return null;
    return Math.sqrt(
        dMin ** 2 + ratio * (dMax ** 2 - dMin ** 2)
    );
}

// end of function calculateImpellerDiameter(targetHead, minHead, maxHead, dMin, dMax)

function applySpeedCorrection(flow, head, power, baseRPM, ratedRPM) {    
    const ratio = ratedRPM / baseRPM;    
    return {
        gpm: flow * ratio,       
        head: head * ratio * ratio,
        kw: power * ratio * ratio * ratio  
    };
}

// end of function applySpeedCorrection(flow, head, power, baseRPM, ratedRPM)

function calculatePump(){
        const model = modelSelect.value;
    const ratedFlow = parseFloat(flowSelect.value);
    const ratedRPM = parseFloat(document.getElementById("ratedRPM").value);
    const unit = document.getElementById("pressureUnit").value;

    const ratedHeadM = headToMeter(
        parseFloat(document.getElementById("ratedHead").value),
        unit
    );

    if (!model || !ratedFlow || !ratedRPM || !ratedHeadM) {
        return console.log("Please complete all inputs");
    }

    const baseRPM = getBaseSpeed(model);

    const minCurve = getPumpData(minDB, model);
    const maxCurve = getPumpData(maxDB, model);

    if (!minCurve || !maxCurve) {
        return console.log("Pump database not found");
    }

    let rminCurve = minCurve.map(point => {
        return applySpeedCorrection(
            point.gpm,   
            point.head,  
            point.kw,    
            baseRPM,
            ratedRPM
        );
    });

    let rmaxCurve = maxCurve.map(point => {
        return applySpeedCorrection(
            point.gpm,   
            point.head,  
            point.kw,    
            baseRPM,
            ratedRPM
        );
    });

    const Hmin = getValueAtFlow(rminCurve, ratedFlow, "head");
    const Hmax = getValueAtFlow(rmaxCurve, ratedFlow, "head");

    if (Hmin === null || Hmax === null) {
        return console.log("Rated flow is outside pump curve range");
    }

    const range = getImpellerRange(model);
    if (!range) {
        console.log("Impeller range not found for selected pump");
        return;
    }
    const { dMin, dMax } = range;      

    const impeller = calculateImpellerDiameter(ratedHeadM, Hmin, Hmax, dMin, dMax);

    if (!impeller) {
        return console.log("Required head is outside impeller range");
    }

    let D = 0.0;
    let ratedCurve;

    if (impeller >= ((dMin+dMax) / 2)){
        let flowArr = rmaxCurve.map(p => p.gpm);
        let headArr = rmaxCurve.map(p => p.head);
        let powerArr = rmaxCurve.map(p => p.kw);
        D = findBestD(flowArr, headArr, ratedFlow, ratedHeadM, dMin, dMax, dMax);
        ratedCurve = flowArr.map((flow, i) => {
            return applySpeedCorrection(flow, headArr[i], powerArr[i], dMax, D);
        });
    }

    if (impeller < ((dMin+dMax) / 2)){
        let flowArr = rminCurve.map(p => p.gpm);
        let headArr = rminCurve.map(p => p.head);
        let powerArr = rminCurve.map(p => p.kw);
        D = findBestD(flowArr, headArr, ratedFlow, ratedHeadM, dMin, dMax, dMin);
        ratedCurve = flowArr.map((flow, i) => {
            return applySpeedCorrection(flow, headArr[i], powerArr[i], dMin, D);
        });
    }

    if (!range) {
        console.log("Impeller range not found");
        return;
    }

    printResults(model, ratedCurve, unit, ratedFlow, D, dMin, dMax);
}

document.getElementById("calculateBtn").addEventListener("click", () => {

calculatePump();

});

// end of document.getElementById("calculateBtn").addEventListener("click", ()

function printResults(model, curve, unit, ratedFlow, impeller, dMin, dMax) {
    const sorted = [...curve].sort((a, b) => a.flow - b.flow);
    const interp = (flow, key) => {
        for (let i = 0; i < sorted.length - 1; i++) {
            const p1 = sorted[i];
            const p2 = sorted[i + 1];
            if (flow >= p1.gpm && flow <= p2.gpm) {                 
                return interpolate(flow, p1.gpm, p1[key], p2.gpm, p2[key]);
            }
        }
        return null;
    };

    const ratedHead = interp(ratedFlow, "head");
    const ratedPower = interp(ratedFlow, "kw");
    const churnHead = interp(0, "head");

    const flow150 = ratedFlow * 1.5;
    const head150 = interp(flow150, "head");
    const power150 = interp(flow150, "kw");

    const maxPower = Math.max(...sorted.map(p => p.kw));
    const maxFlow = sorted[sorted.length - 1].flow;

    const resultsPanel = document.getElementById("resultsPanel");
    const tbody = document.querySelector("#resultsTable tbody");
    tbody.innerHTML = "";

    const addRow = (param, value, warn = false) => {
        const icon = warn ? "⚠️" : "";
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${param}</td><td class="${warn ? 'warning' : 'safe'}">${icon} ${value}</td>`;
        tbody.appendChild(tr);
    };

    addRow("Pump Model", model);
    addRow("Calculated Impeller Diameter", impeller.toFixed(2), impeller < dMin || impeller > dMax);
    addRow("Rated Flow (GPM)", ratedFlow.toFixed(1));
    addRow(`Rated Pressure (${unit})`, ratedHead ? meterToUnit(ratedHead, unit).toFixed(2) : "N/A");
    addRow(`Churn Pressure (${unit})`, churnHead ? meterToUnit(churnHead, unit).toFixed(2) : "N/A");
    addRow(`Pressure @150% (${unit})`, head150 ? meterToUnit(head150, unit).toFixed(2) : "Out of Curve", flow150 > maxFlow);
    addRow("Power @Rated (kW/HP)", ratedPower ? formatKW_HP(ratedPower) : "N/A");
    addRow("Power @150% (kW/HP)", power150 ? formatKW_HP(power150) : "Out of Curve", flow150 > maxFlow);
    addRow("Max Power (kW/HP)", formatKW_HP(maxPower));

    resultsPanel.classList.add("show");

    plotPumpCurve(curve, dMin, dMax, impeller, ratedFlow);
}

function formatKW_HP(kw) {
    if (kw == null || isNaN(kw)) return "N/A";
    const hp = kw / 0.746;
    return `${kw.toFixed(2)} kW / ${hp.toFixed(2)} HP`;
}


function findBestD(flow, head, target_flow, target_head, dMin, dMax, base_D) {    
    let bestD = null;
    let minDiff = Infinity;
    for (let D = dMin; D <= dMax; D += 0.1) {        
        const { rflow, rhead } = scaleDiameter(flow, head, base_D, D);
        let interpolatedHead = interpolateD(rflow, rhead, target_flow);
        let diff = Math.abs(interpolatedHead - target_head);        
        if (diff < minDiff) {
            minDiff = diff;
            bestD = D;
        }
    }
    return bestD;
}

function scaleDiameter(flow, head, base_D, D) {
    const ratio = D / base_D;

    const rflow = flow.map(f => f * ratio);
    const rhead = head.map(h => h * ratio * ratio);

    return { rflow, rhead };
}
// Simple linear interpolation function
function interpolateD(flowArr, headArr, target_flow) {

    for (let i = 0; i < flowArr.length - 1; i++) {
        if (target_flow >= flowArr[i] && target_flow <= flowArr[i + 1]) {
            let t = (target_flow - flowArr[i]) / (flowArr[i + 1] - flowArr[i]);
            return headArr[i] + t * (headArr[i + 1] - headArr[i]);
        }
    }
    // If out of range, return closest value
    if (target_flow < flowArr[0]) return headArr[0];
    if (target_flow > flowArr[flowArr.length - 1]) return headArr[headArr.length - 1];
}

function plotPumpCurve(curve, dMin, dMax, base_D, ratedFlow) {
    const flow = curve.map(p => p.gpm);
    const head = curve.map(p => p.head);
    const power = curve.map(p => p.kw);

    const { flow_p: flowSmooth, head_p: headSmooth } = toPolynomial(flow, head, 2, 300);
    const powerSmooth = toPolynomialP(flow, power, 3, 300);    
    
    /*const powerSmooth = flowSmooth.map(f => interpolateDi(flow, power, f));*/
/*    
    const flowSmooth = generateFlowRange(flow[0], flow[flow.length - 1], 100);
    const headSmooth = flowSmooth.map(f => interpolateDi(flow, head, f));
    const powerSmooth = flowSmooth.map(f => interpolateDi(flow, power, f));
*/
    const headMinSmooth = flowSmooth.map(f => interpolateDi(flowSmooth, headSmooth, f, base_D, dMin));
    const headMaxSmooth = flowSmooth.map(f => interpolateDi(flowSmooth, headSmooth, f, base_D, dMax));        

    const flow150 = ratedFlow * 1.5;
    const ratedHead = interpolateDi(flow, head, ratedFlow);
    const head150 = interpolateDi(flow, head, flow150);
    const ratedPower = interpolateDi(flow, power, ratedFlow);
    const power150 = interpolateDi(flow, power, flow150);
    const maxFlow = flowSmooth[flowSmooth.length - 1];

    const data = {
        labels: flowSmooth,
        datasets: [
            {
                label: "Head (m) - Base",
                data: headSmooth,
                borderColor: "blue",
                fill: false,
                pointRadius: 0, 
            },
            {
                label: `Head @ dMin (${dMin} mm)`,
                data: headMinSmooth,
                borderColor: "black",
                fill: false,                
                pointRadius: 0,
            },
            {
                label: `Head @ dMax (${dMax} mm)`,
                data: headMaxSmooth,
                borderColor: "black",
                fill: false,                
                pointRadius: 0,
            }
        ]
    };

    const config = {
        type: "line",
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                title: {
                    display: true,
                    text: "Pump Curve (Head)"
                },
                annotation: {
                    annotations: {
                        ratedHead: {
                            type: 'point',
                            xValue: ratedFlow,
                            yValue: ratedHead,
                            backgroundColor: 'blue',
                            radius: 6,
                            label: {
                                enabled: true,
                                content: `${ratedHead.toFixed(2)} m`,
                                position: 'top'
                            }
                        },
                        head150: {
                            type: 'point',
                            xValue: flow150,
                            yValue: head150,
                            backgroundColor: 'blue',
                            radius: 6,
                            label: {
                                enabled: true,
                                content: `${head150.toFixed(2)} m`,
                                position: 'top'
                            }
                        },
                    }
                }
            },
            scales: {
                x: {
                type: 'linear',
                title: { display: false, text: "Flow (GPM)" },
                min: 0,
                max: maxFlow,
                ticks: {
                    stepSize: 500,
                }
            },
                y: { title: { display: true, text: "Head (m)" }, min: 0 }
            }
        },
        plugins: [Chart.registry.getPlugin('annotation')]
    };

    new Chart(document.getElementById("pumpCurveChart"), config);

    const dataPower = {
        labels: flowSmooth,
        datasets: [
            {
                label: "Power (kW) - Base x3",
                data: powerSmooth,
                borderColor: "red",
                fill: false,                
                pointRadius: 0,
            }
        ]
    };

    const configPower = {
        type: "line",
        data: dataPower,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                title: {
                    display: false,
                },
                annotation: {
                    annotations: {
                        ratedPower: {
                            type: 'point',
                            xValue: ratedFlow,
                            yValue: ratedPower,
                            backgroundColor: 'red',
                            radius: 6,
                            label: {
                                enabled: true,
                                content: `${(ratedPower).toFixed(2)} kW`,
                                position: 'bottom'
                            }
                        },
                        power150: {
                            type: 'point',
                            xValue: flow150,
                            yValue: power150,
                            backgroundColor: 'red',
                            radius: 6,
                            label: {
                                enabled: true,
                                content: `${(power150).toFixed(2)} kW`,
                                position: 'bottom'
                            }
                        }
                    }
                }
            },
            scales: {
                x: {
                type: 'linear',
                title: { display: true, text: "Flow (GPM)" },
                min: 0,
                max: maxFlow,
                ticks: {
                    stepSize: 500,
                }
            },
                y: { title: { display: true, text: "Power (kW)" }, min: 0 }
            }
        },
        plugins: [Chart.registry.getPlugin('annotation')]
    };

    new Chart(document.getElementById("pumpPowerChart"), configPower);

}

function generateFlowRange(start, end, points) {
    const step = (end - start) / (points - 1);
    return Array.from({length: points}, (_, i) => start + i * step);
}

function interpolateDi(flowArr, headArr, targetFlow, base_D = 1, D = 1) {
    const ratio = D / base_D;
    const scaledFlow = flowArr.map(f => f * ratio);
    const scaledHead = headArr.map(h => h * ratio * ratio);

    for (let i = 0; i < scaledFlow.length - 1; i++) {
        if (targetFlow >= scaledFlow[i] && targetFlow <= scaledFlow[i+1]) {
            const t = (targetFlow - scaledFlow[i]) / (scaledFlow[i+1] - scaledFlow[i]);
            return scaledHead[i] + t * (scaledHead[i+1] - scaledHead[i]);
        }
    }

    if (targetFlow < scaledFlow[0]) return scaledHead[0];
    if (targetFlow > scaledFlow[scaledFlow.length - 1]) return scaledHead[scaledHead.length - 1];
    return null;
}

function toPolynomial(flow, head, degree = 3, points = 300) {
    if (flow.length !== head.length) {
        console.log("Flow and head arrays must have the same length");
    }

    const x = flow.map(Number);
    const y = head.map(Number);

    const coeffs = polyfit(x, y, degree);

    const poly = v =>
        coeffs.reduce((sum, c, i) => sum + c * Math.pow(v, i), 0);

    const minX = Math.min(...x);
    const maxX = Math.max(...x);
    const step = (maxX - minX) / (points - 1);

    const flow_p = Array.from({ length: points }, (_, i) => minX + i * step);
    const head_p = flow_p.map(poly);

    return { flow_p, head_p };
}

function toPolynomialP(flow, power, degree = 3, points = 300) {
    if (flow.length !== power.length) {
        console.log("Flow and power arrays must have the same length");        
    }

    const x = flow.map(Number);
    const y = power.map(Number);

    const coeffs = polyfit(x, y, degree);

    const poly = v =>
        coeffs.reduce((sum, c, i) => sum + c * Math.pow(v, i), 0);

    const minX = Math.min(...x);
    const maxX = Math.max(...x);
    const step = (maxX - minX) / (points - 1);

    const flow_p = Array.from({ length: points }, (_, i) => minX + i * step);
    const power_p = flow_p.map(poly);

    return power_p;
}

function polyfit(x, y, degree) {
    const n = degree + 1;

    const X = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) =>
            x.reduce((sum, xi) => sum + Math.pow(xi, i + j), 0)
        )
    );

    const Y = Array.from({ length: n }, (_, i) =>
        x.reduce((sum, xi, k) => sum + y[k] * Math.pow(xi, i), 0)
    );

    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const factor = X[j][i] / X[i][i];
            for (let k = i; k < n; k++) {
                X[j][k] -= factor * X[i][k];
            }
            Y[j] -= factor * Y[i];
        }
    }

    const coeffs = Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
        coeffs[i] = Y[i] / X[i][i];
        for (let j = i - 1; j >= 0; j--) {
            Y[j] -= X[j][i] * coeffs[i];
        }
    }

    return coeffs; 
}
