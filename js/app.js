const barcodeInput = document.getElementById("barcodeInput");

const statusText = document.getElementById("status");
const counterText = document.getElementById("counter");

const itemCodeValue = document.getElementById("itemCodeValue");
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

    if (window.barcodeMap.size === 0) {

        alert("Please upload Database first.");

        return;

    }

    if (window.missionMap.size === 0) {

        alert("Please upload Mission file first.");

        return;

    }

    const product = window.barcodeMap.get(barcode);

    if (!product) {

        itemCodeValue.textContent = "-----";
        colorValue.textContent = "-----";
        sizeValue.textContent = "-----";

        optionsBox.style.display = "none";

        setStatus("🔴 BARCODE NOT FOUND", "not-found");

        barcodeInput.value = "";
        barcodeInput.focus();

        return;

    }

    const itemCode = product.itemCode;

    const missionItems = window.missionMap.get(itemCode);

    if (!missionItems) {

        itemCodeValue.textContent = "-----";
        colorValue.textContent = "-----";
        sizeValue.textContent = "-----";

        optionsBox.style.display = "none";

        setStatus("🔴 NOT FOUND", "not-found");

        barcodeInput.value = "";
        barcodeInput.focus();

        return;

    }

    itemCodeValue.textContent = itemCode;
    colorValue.textContent = "-----";
    sizeValue.textContent = "-----";

    currentResults = missionItems;
    currentColor = "";

    const sizeView = missionItems.map(item => ({
        ...item,
        Color: item.color,
        Size: item.size
    }));

    colorOptions.innerHTML = "";
    sizeOptions.innerHTML = "";

    optionsBox.style.display = "block";

    const colors = [...new Set(

        missionItems.map(item => item.color)

    )];

    if (colors.length === 1) {

        showSizes(sizeView, colors[0]);

    } else {

        colors.forEach(color => {

            const btn = document.createElement("button");

            btn.textContent = color;

            btn.className = "color-btn";

            btn.onclick = () => {

                document
                    .querySelectorAll(".color-btn")
                    .forEach(b => b.classList.remove("active"));

                btn.classList.add("active");

                showSizes(sizeView, color);

            };

            colorOptions.appendChild(btn);

        });

    }

    setStatus("🟢 FOUND", "found");

    barcodeInput.value = "";

    barcodeInput.focus();

};

 function showSizes(results, color) {
selectedCount = 0;

confirmBtn.disabled = true;

confirmBtn.textContent = "✅ Confirm Selection";
currentResults = results;
currentColor = color;

colorValue.textContent = color;

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

     const key = `${itemCodeValue.textContent}-${color}-${size}`;

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

        const key = `${itemCodeValue.textContent}-${currentColor}-${btn.textContent}`;

        scannedItems.add(key);

        btn.classList.remove("selected");

        btn.classList.add("collected");

        btn.disabled=true;

        collected++;

    });

    counterText.textContent =
    `${collected} / ${window.excelData.length}`;

});