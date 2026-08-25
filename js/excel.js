// =========================
// عناصر الصفحة
// =========================

const missionFile = document.getElementById("missionFile");

// =========================
// Databases
// =========================

window.barcodeMap = new Map();
window.missionMap = new Map();
window.missionItems = [];
window.missionTotalRequired = 0;
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

if (missionFile) {
    missionFile.addEventListener("change", readMissionFile);
}

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
            (!firstRow.hasOwnProperty("Item Code") && !firstRow.hasOwnProperty("itemid")) ||
            !firstRow.hasOwnProperty("Color") ||
            !firstRow.hasOwnProperty("Size")
        ) {

            alert("❌ Invalid Mission file.\nPlease use the official MINI TOWNTEAM template.");

            window.missionMap.clear();
            window.missionItems = [];
            window.excelData = [];

            if (missionFile) missionFile.value = "";

            return;

        }

        window.missionMap.clear();
        window.missionItems = [];

        let lastItemCode = "";
        const variantMap = new Map();

        rows.forEach(row => {
            let rawCode = row["Item Code"] !== undefined ? row["Item Code"] : row["itemid"];
            let itemCode = String(rawCode || "").trim();

            // Fill-down normalization for blank/merged Item Code cells
            if (!itemCode) {
                itemCode = lastItemCode;
            } else {
                lastItemCode = itemCode;
            }

            if (!itemCode) return;

            const color = String(row["Color"] || "").trim();
            const size = String(row["Size"] || "").trim();
            const parsedQty = Number(row["Qty"]);
            const qty = Number.isInteger(parsedQty) && parsedQty > 0 ? parsedQty : 1;

            const key = `${itemCode}|${color}|${size}`;

            let variant = variantMap.get(key);
            if (!variant) {
                variant = {
                    itemCode,
                    color,
                    size,
                    requiredQty: 0,
                    scannedQty: 0,
                    sourceRow: { ...row, "Item Code": itemCode, Color: color, Size: size }
                };
                variantMap.set(key, variant);
                window.missionItems.push(variant);

                if (!window.missionMap.has(itemCode)) {
                    window.missionMap.set(itemCode, []);
                }
                window.missionMap.get(itemCode).push(variant);
            }

            variant.requiredQty += qty;
        });

        window.missionTotalRequired = window.missionItems.reduce((sum, item) => sum + item.requiredQty, 0);
        window.excelData = rows;

        if (window.resetMissionProgress) {
            window.resetMissionProgress();
        }

        alert("Mission Loaded Successfully ✅");

    };

    reader.readAsArrayBuffer(file);

}
