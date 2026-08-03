// عناصر الصفحة
const excelFile = document.getElementById("excelFile");
const missionFile = document.getElementById("missionFile");

// Database الأساسية
window.barcodeMap = new Map();
window.missionMap = new Map();
window.excelData = [];

// أول ما المستخدم يختار ملف
excelFile.addEventListener("change", readExcel);
missionFile.addEventListener("change", readMissionFile);

function readExcel(event) {

    const file = event.target.files[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = function (e) {

        const data = new Uint8Array(e.target.result);

        const workbook = XLSX.read(data, { type: "array" });

        const sheetName = workbook.SheetNames[0];

        const sheet = workbook.Sheets[sheetName];

       const rows = XLSX.utils.sheet_to_json(sheet);

       const firstRow = rows[0];
if (
    !firstRow ||
    !firstRow.hasOwnProperty("Barcode") ||
    !firstRow.hasOwnProperty("Item Code") ||
    !firstRow.hasOwnProperty("Color") ||
    !firstRow.hasOwnProperty("Size")
) {

    alert("❌ Invalid Excel file.\nPlease use the official MINI TOWNTEAM template.");

window.barcodeMap.clear();

excelFile.value = "";

    return;
}
// بناء الـ Barcode Map

window.barcodeMap.clear();

rows.forEach(row => {

    const barcode = String(row["Barcode"]).trim();

    window.barcodeMap.set(barcode, {

        itemCode: String(row["Item Code"]).trim(),

        color: String(row["Color"]).trim(),

        size: String(row["Size"]).trim()

    });

});
       console.log(window.barcodeMap);
       console.log("Products:", window.barcodeMap.size);  

        alert("Excel Loaded Successfully ✅");

    };

    reader.readAsArrayBuffer(file);

}
function readMissionFile(event) {

    const file = event.target.files[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = function (e) {

        const data = new Uint8Array(e.target.result);

        const workbook = XLSX.read(data, { type: "array" });

        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        const rows = XLSX.utils.sheet_to_json(sheet);

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

        console.log(window.missionMap);

        window.excelData = rows;

        console.log(
            "Mission Products:",
            window.missionMap.size
        );

        alert("Mission Loaded Successfully ✅");

    };

    reader.readAsArrayBuffer(file);

}