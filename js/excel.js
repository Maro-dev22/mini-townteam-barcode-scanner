// =========================
// عناصر الصفحة
// =========================

const missionFile = document.getElementById("missionFile");

// =========================
// Databases
// =========================

window.barcodeMap = new Map();
window.missionMap = new Map();
window.excelData = [];
window.missionFileName = "";
window.missionSheetName = "Sheet1";
window.missionHeaders = [];

// =========================
// تحميل قاعدة البيانات الأساسية تلقائياً
// =========================

fetch("data/master.json")
    .then(res => res.json())
    .then(data => {

        data.forEach(item => {

            const barcode = String(item["Barcode"]).trim();

            window.barcodeMap.set(barcode, {

                itemCode: String(item["Item Code"]).trim(),
                color: String(item["Color"]).trim(),
                size: String(item["Size"]).trim()

            });

        });

        console.log(`✅ Master Database Loaded: ${window.barcodeMap.size} items`);

    })
    .catch(err => {

        console.error("❌ Failed to load master.json", err);

    });

// =========================
// الملف اليومي
// =========================

missionFile.addEventListener("change", readMissionFile);

function readMissionFile(event) {

    const file = event.target.files[0];

    if (!file) return;
    
    window.missionFileName = file.name;

    const reader = new FileReader();

    reader.onload = function (e) {

        const data = new Uint8Array(e.target.result);

        const workbook = XLSX.read(data, { type: "array" });
        
        window.missionSheetName = workbook.SheetNames[0];

        const sheet = workbook.Sheets[window.missionSheetName];

        const rows = XLSX.utils.sheet_to_json(sheet);
        
        const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (rawRows.length > 0) {
            window.missionHeaders = rawRows[0];
        }

        const firstRow = rows[0];

        if (
            !firstRow ||
            !firstRow.hasOwnProperty("Item Code") ||
            !firstRow.hasOwnProperty("Color") ||
            !firstRow.hasOwnProperty("Size")
        ) {

            alert("❌ Invalid Mission file.\nPlease use the official MINI TOWNTEAM template.");

            window.missionMap.clear();
            window.excelData = [];

            missionFile.value = "";

            return;

        }

        window.missionMap.clear();

        rows.forEach(row => {

            const itemCode = String(row["Item Code"]).trim();

            const color = String(row["Color"]).trim();

            const size = String(row["Size"]).trim();

            if (!window.missionMap.has(itemCode)) {

                window.missionMap.set(itemCode, []);

            }

            window.missionMap.get(itemCode).push({

                color,
                size

            });

        });

        window.excelData = rows;

        console.log("Mission Products:", window.missionMap.size);

        alert("Mission Loaded Successfully ✅");

    };

    reader.readAsArrayBuffer(file);

}