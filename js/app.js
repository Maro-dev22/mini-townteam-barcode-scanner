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

// =========================
// Dashboard & Progress UI
// =========================
window.updateDashboard = function() {
    const total = window.missionTotalRequired || (window.excelData ? window.excelData.length : 0);
    const remaining = Math.max(0, total - collected);

    const progressBar = document.getElementById("progressBar");
    const remainingCounter = document.getElementById("remainingCounter");
    const totalCounter = document.getElementById("totalCounter");

    if (remainingCounter) remainingCounter.textContent = `Remaining: ${remaining}`;
    if (totalCounter) totalCounter.textContent = `Total: ${total}`;

    if (progressBar) {
        const percent = total > 0 ? (collected / total) * 100 : 0;
        progressBar.style.width = `${percent}%`;
    }
};

window.resetMissionProgress = function() {
    collected = 0;
    selectedCount = 0;
    currentResults = [];
    currentColor = "";
    if (counterText) counterText.textContent = `0 / ${window.missionTotalRequired || 0}`;
    window.updateDashboard();
};

window.updateLastScanned = function(text) {
    const lastScanned = document.getElementById("lastScannedItem");
    if (lastScanned) {
        lastScanned.textContent = text;
    }
};

// =========================
// Status Function
// =========================
function setStatus(message, className) {
    if (statusText) {
        statusText.textContent = message;
        statusText.className = className;
    }
}

window.setStatus = setStatus;

// =========================
// Barcode Input
// =========================
if (barcodeInput) {
    barcodeInput.addEventListener("keydown", function (e) {

        if (e.key === "Enter") {

            searchBarcode(barcodeInput.value);

        }

    });
}

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

    let itemCode = null;
    const product = window.barcodeMap.get(barcode);

    if (product) {
        itemCode = product.itemCode;
    } else if (window.missionMap.has(barcode)) {
        itemCode = barcode;
    }

    if (!itemCode) {

        if (itemCodeValue) itemCodeValue.textContent = "-----";
        if (colorValue) colorValue.textContent = "-----";
        if (sizeValue) sizeValue.textContent = "-----";

        if (optionsBox) optionsBox.style.display = "none";

        setStatus("🔴 BARCODE NOT FOUND", "not-found");
        window.onScanError?.();

        if (barcodeInput) {
            barcodeInput.value = "";
            barcodeInput.focus();
        }

        return;

    }

    const missionItems = window.missionMap.get(itemCode);

    if (!missionItems || missionItems.length === 0) {

        if (itemCodeValue) itemCodeValue.textContent = "-----";
        if (colorValue) colorValue.textContent = "-----";
        if (sizeValue) sizeValue.textContent = "-----";

        if (optionsBox) optionsBox.style.display = "none";

        setStatus("🔴 NOT FOUND", "not-found");
        window.onScanError?.();

        if (barcodeInput) {
            barcodeInput.value = "";
            barcodeInput.focus();
        }

        return;

    }

    if (itemCodeValue) itemCodeValue.textContent = itemCode;
    if (colorValue) colorValue.textContent = "-----";
    if (sizeValue) sizeValue.textContent = "-----";

    currentResults = missionItems;
    currentColor = "";

    if (colorOptions) colorOptions.innerHTML = "";
    if (sizeOptions) sizeOptions.innerHTML = "";

    if (optionsBox) optionsBox.style.display = "block";

    const colors = [...new Set(

        missionItems.map(item => item.color)

    )];

    if (colors.length === 1) {

        showSizes(missionItems, colors[0]);

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

                showSizes(missionItems, color);

            };

            if (colorOptions) colorOptions.appendChild(btn);

        });

    }

    setStatus("🟢 FOUND", "found");
    window.onScanSuccess?.();

    if (barcodeInput) {
        barcodeInput.value = "";
        barcodeInput.focus();
    }

};

function showSizes(results, color) {
    selectedCount = 0;

    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = "✅ Confirm Selection";
        confirmBtn.style.display = "block";
    }

    currentResults = results;
    currentColor = color;

    if (colorValue) colorValue.textContent = color;
    if (sizeOptions) sizeOptions.innerHTML = "";

    const sizes = [...new Set(
        results
            .filter(item => item.color === color)
            .map(item => item.size)
    )];

    sizes.forEach(size => {

        const btn = document.createElement("button");

        btn.className = "size-btn";
        btn.dataset.size = size;

        const variant = results.find(item => item.color === color && item.size === size);

        if (variant && variant.scannedQty >= variant.requiredQty) {

            btn.classList.add("collected");

            btn.disabled = true;

        }

        btn.textContent = variant ? `${size} (${variant.scannedQty}/${variant.requiredQty})` : size;

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

            if (confirmBtn) {
                if (selectedCount > 0) {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = `✅ Confirm (${selectedCount})`;
                } else {
                    confirmBtn.disabled = true;
                    confirmBtn.textContent = "✅ Confirm Selection";
                }
            }

        };

        if (sizeOptions) sizeOptions.appendChild(btn);

    });

}

if (confirmBtn) {
    confirmBtn.addEventListener("click", () => {

        const selectedButtons = document.querySelectorAll(".size-btn.selected");

        if (selectedButtons.length === 0) {

            alert("Choose at least one size");

            return;

        }

        selectedButtons.forEach(btn => {

            selectedCount = 0;

            confirmBtn.disabled = true;

            confirmBtn.textContent = "✅ Confirm Selection";

            if (barcodeInput) {
                barcodeInput.value = "";
                barcodeInput.focus();
            }

            const size = btn.dataset.size || btn.textContent;
            const variant = currentResults.find(item => item.color === currentColor && item.size === size);

            if (variant) {
                if (variant.scannedQty < variant.requiredQty) {
                    variant.scannedQty += 1;
                    collected += 1;
                }

                const isComplete = variant.scannedQty >= variant.requiredQty;

                btn.classList.remove("selected");
                if (isComplete) {
                    btn.classList.add("collected");
                    btn.disabled = true;
                }

                btn.textContent = `${variant.size} (${variant.scannedQty}/${variant.requiredQty})`;

                setStatus(
                    isComplete
                        ? `✅ Item complete: ${variant.scannedQty}/${variant.requiredQty}`
                        : `✅ Scanned: ${variant.scannedQty}/${variant.requiredQty}`,
                    "found"
                );

                window.updateDashboard();
                window.updateLastScanned(`${variant.itemCode}-${variant.color}-${variant.size}`);
            }

        });

        if (counterText) {
            counterText.textContent = `${collected} / ${window.missionTotalRequired || window.excelData.length}`;
        }

    });
}

// =========================
// Export Mission
// =========================
const exportBtn = document.getElementById("exportBtn");

if (exportBtn) {
    exportBtn.addEventListener("click", () => {
        if (!window.excelData || window.excelData.length === 0) {
            alert("No mission loaded.");
            return;
        }

        const originalBtnText = exportBtn.innerHTML;
        exportBtn.innerHTML = "⏳ Exporting Mission...";
        exportBtn.disabled = true;

        setTimeout(() => {
            try {
                const remainingData = (window.missionItems || [])
                    .filter(item => item.scannedQty < item.requiredQty)
                    .map(item => ({
                        ...item.sourceRow,
                        Qty: item.requiredQty - item.scannedQty
                    }));

                if (remainingData.length === 0) {
                    alert("Mission Completed.\nNothing to export.");
                    exportBtn.innerHTML = originalBtnText;
                    exportBtn.disabled = false;
                    return;
                }

                // Create a new worksheet keeping original headers
                const exportHeaders = window.missionHeaders && window.missionHeaders.includes("Qty")
                    ? window.missionHeaders
                    : [...(window.missionHeaders || []), "Qty"];
                const ws = XLSX.utils.json_to_sheet(remainingData, { header: exportHeaders });

                // Create a new workbook
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, window.missionSheetName || "Sheet1");

                // Generate filename
                let exportName = "Mission_Remaining.xlsx";
                if (window.missionFileName) {
                    const nameParts = window.missionFileName.split('.');
                    if (nameParts.length > 1) {
                        const ext = nameParts.pop();
                        exportName = nameParts.join('.') + "_Remaining." + ext;
                    } else {
                        exportName = window.missionFileName + "_Remaining.xlsx";
                    }
                }

                // Download the file
                XLSX.writeFile(wb, exportName);

                exportBtn.innerHTML = "✅ Mission exported successfully.";
                setTimeout(() => {
                    exportBtn.innerHTML = originalBtnText;
                    exportBtn.disabled = false;
                }, 3000);

            } catch (err) {
                console.error("Export Error:", err);
                alert("An error occurred while exporting the mission.");
                exportBtn.innerHTML = originalBtnText;
                exportBtn.disabled = false;
            }
        }, 100); // Short delay to allow UI to render the 'Exporting' state
    });
}
