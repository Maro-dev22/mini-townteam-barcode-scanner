const barcodeInput = document.getElementById("barcodeInput");

const statusText = document.getElementById("status");
const counterText = document.getElementById("counter");

const barcodeValue = document.getElementById("barcodeValue");
const colorValue = document.getElementById("colorValue");
const sizeValue = document.getElementById("sizeValue");
const optionsBox = document.getElementById("optionsBox");
const colorOptions = document.getElementById("colorOptions");
const sizeOptions = document.getElementById("sizeOptions");
const confirmBtn = document.getElementById("confirmBtn");

let selectedCount = 0;
let currentResults = [];
let currentColor = "";

let collected = 0;

// هنستخدمها بعدين لما يبقى الاختيار بالكود + اللون + المقاس
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

    // البحث برقم الموديل (مثال: 76658)
    const results = window.excelData.filter(item => {

        const modelCode = String(item.Barcode)
            .match(/\d{5}/)?.[0];

        return modelCode === barcode;

    });

    if (results.length > 0) {

        console.log(results);

        // استخراج الألوان بدون تكرار
        const colors = [...new Set(results.map(item => item.Color))];

        // استخراج المقاسات بدون تكرار
        const sizes = [...new Set(results.map(item => item.Size))];

      barcodeValue.textContent = barcode;

      colorValue.textContent = "-";
      sizeValue.textContent = "-";

       optionsBox.style.display = "block";

       colorOptions.innerHTML = "";
       sizeOptions.innerHTML = "";
       colors.forEach(color => {

    const btn = document.createElement("button");

    btn.textContent = color;

    btn.className = "color-btn";

    btn.onclick = () => {

        document.querySelectorAll(".color-btn").forEach(b => {
            b.classList.remove("active");
        });

        btn.classList.add("active");

        showSizes(results, color);

    };

    colorOptions.appendChild(btn);

});

        setStatus(`🟢 ${results.length} Item(s) Found`, "found");

        // مؤقتاً مش هنزود العداد
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

function showSizes(results, color) {
selectedCount = 0;

confirmBtn.disabled = true;

confirmBtn.textContent = "✅ Confirm Selection";
currentResults = results;
currentColor = color;

confirmBtn.style.display = "block";
    sizeOptions.innerHTML = "";

    const sizes = [...new Set(
        results
            .filter(item => item.Color === color)
            .map(item => item.Size)
    )];

    sizes.forEach(size => {

        const btn = document.createElement("button");

        btn.textContent = size;

        btn.className = "size-btn";

     const key = `${barcodeValue.textContent}-${color}-${size}`;

if (scannedItems.has(key)) {

    btn.classList.add("collected");

    btn.disabled = true;

}

        btn.dataset.selected = "false";

      btn.onclick = () => {

    if (btn.disabled) return;

    if (btn.dataset.selected === "false") {

        btn.dataset.selected = "true";

        btn.classList.add("selected");

        selectedCount++;

    } else {

        btn.dataset.selected = "false";

        btn.classList.remove("selected");

        selectedCount--;

    }

    if (selectedCount > 0) {

        confirmBtn.disabled = false;

        confirmBtn.textContent =
            `✅ Confirm (${selectedCount})`;

    } else {

        confirmBtn.disabled = true;

        confirmBtn.textContent =
            "✅ Confirm Selection";

    }

};

        sizeOptions.appendChild(btn);

    });

}

confirmBtn.addEventListener("click", () => {

    const selectedButtons = document.querySelectorAll(".size-btn.selected");

    if(selectedButtons.length===0){

        alert("Choose at least one size");

        return;

    }

    selectedButtons.forEach(btn=>{

        selectedCount = 0;

confirmBtn.disabled = true;

confirmBtn.textContent =
"✅ Confirm Selection";

barcodeInput.value = "";

barcodeInput.focus();

setStatus(
`✅ ${selectedButtons.length} Piece(s) Collected`,
"found"
);

setTimeout(()=>{

    setStatus("🟡 Ready","");

},2000);

        const key = `${barcodeValue.textContent}-${currentColor}-${btn.textContent}`;

        scannedItems.add(key);

        btn.classList.remove("selected");

        btn.classList.add("collected");

        btn.disabled=true;

        collected++;

    });

    counterText.textContent =
    `${collected} / ${window.excelData.length}`;

});