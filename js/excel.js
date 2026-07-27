// عناصر الصفحة
const excelFile = document.getElementById("excelFile");

// نخزن البيانات بشكل عام ليقدر app.js يستخدمها
window.excelData = [];

// أول ما المستخدم يختار ملف
excelFile.addEventListener("change", readExcel);

function readExcel(event) {

    const file = event.target.files[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = function (e) {

        const data = new Uint8Array(e.target.result);

        const workbook = XLSX.read(data, { type: "array" });

        const sheetName = workbook.SheetNames[0];

        const sheet = workbook.Sheets[sheetName];

        window.excelData = XLSX.utils.sheet_to_json(sheet);
        const firstRow = window.excelData[0];

if (
    !firstRow ||
    !firstRow.hasOwnProperty("Barcode") ||
    !firstRow.hasOwnProperty("Color") ||
    !firstRow.hasOwnProperty("Size")
) {

    alert("❌ Invalid Excel file.\nPlease use the official MINI TOWNTEAM template.");

    window.excelData = [];

    excelFile.value = "";

    return;
}

        console.log(window.excelData);

        alert("Excel Loaded Successfully ✅");

    };

    reader.readAsArrayBuffer(file);

}