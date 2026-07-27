const barcodeInput = document.getElementById("barcodeInput");

const statusText = document.getElementById("status");
const counterText = document.getElementById("counter");

const barcodeValue = document.getElementById("barcodeValue");
const colorValue = document.getElementById("colorValue");
const sizeValue = document.getElementById("sizeValue");

let collected = 0;
const scannedItems = new Set();

// =========================
// Status Function
// =========================
function setStatus(message, className) {

    statusText.textContent = message;
    statusText.className = className;

}

window.setStatus = setStatus;

// =========================
// Barcode Input
// =========================
barcodeInput.addEventListener("keydown", function (e) {

    if (e.key === "Enter") {

        searchBarcode(barcodeInput.value);

    }

});

// =========================
// Search Function
// =========================
window.searchBarcode = function (barcode) {

    barcode = String(barcode).trim();

    if (barcode === "") return;

    if (!window.excelData || window.excelData.length === 0) {

        alert("Please upload the Excel file first.");

        return;

    }

    // Already Scanned
    if (scannedItems.has(barcode)) {

        setStatus("🟠 Already Scanned", "already");

        barcodeValue.textContent = barcode;
        colorValue.textContent = "-";
        sizeValue.textContent = "-";

        barcodeInput.value = "";
        barcodeInput.focus();

        return;

    }

    // Search
    const found = window.excelData.find(item =>
        String(item.Barcode).trim() === barcode
    );

    if (found) {

        scannedItems.add(barcode);

        collected++;

        barcodeValue.textContent = found.Barcode;
        colorValue.textContent = found.Color;
        sizeValue.textContent = found.Size;

        setStatus("🟢 Found", "found");

        counterText.textContent =
            `${collected} / ${window.excelData.length}`;

    } else {

        barcodeValue.textContent = barcode;
        colorValue.textContent = "-";
        sizeValue.textContent = "-";

        setStatus("🔴 Not Found", "not-found");

    }

    barcodeInput.value = "";
    barcodeInput.focus();

};