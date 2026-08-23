"use strict";

// This page currently reads only promotion data. OriginalPriceRepository is kept
// separate so future original-price import and calculations can be added safely.
const PromotionParser = {
    parse(value) {
        const text = String(value ?? "").trim();
        const discountMatch = /^disc\s*(\d+(?:\.\d+)?)\s*%$/i.exec(text);

        if (discountMatch) {
            return {
                type: "percentage",
                percentage: Number(discountMatch[1]),
                display: `${discountMatch[1]}% OFF`
            };
        }

        if (/^original$/i.test(text)) {
            return { type: "original", display: "No Discount" };
        }

        const price = Number(text.replace(/,/g, ""));
        if (text !== "" && Number.isFinite(price)) {
            return { type: "fixed-price", price, display: `Current Price: ${text} EGP` };
        }

        return { type: "unknown", display: text || "Promotion unavailable" };
    }
};

const OriginalPriceRepository = {
    // Reserved for a future original-price Excel import.
    prices: new Map(),
    get(itemId) {
        return this.prices.get(itemId);
    }
};

const PromotionRepository = {
    promotions: new Map(),

    clear() {
        this.promotions.clear();
    },

    load(rows) {
        this.clear();
        rows.forEach((row) => {
            const itemId = String(row.itemid ?? "").trim();
            const promotion = row.Promotion;
            if (itemId) this.promotions.set(itemId, promotion);
        });
    },

    get(itemId) {
        return this.promotions.get(itemId);
    },

    has(itemId) {
        return this.promotions.has(itemId);
    }
};

const promotionFile = document.getElementById("promotionFile");
const itemCodeInput = document.getElementById("itemCodeInput");
const searchButton = document.getElementById("searchPromotionBtn");
const fileStatus = document.getElementById("fileStatus");
const resultCard = document.getElementById("resultCard");
const resultItemCode = document.getElementById("resultItemCode");
const resultPromotion = document.getElementById("resultPromotion");
let promotionFileLoaded = false;

function setFileStatus(message, state = "ready") {
    fileStatus.textContent = message;
    fileStatus.className = `page-status ${state}`;
}

function hideResult() {
    resultCard.hidden = true;
}

function showResult(itemId, promotion) {
    resultItemCode.textContent = itemId;
    resultPromotion.textContent = promotion.display;
    resultPromotion.className = promotion.type === "percentage" || promotion.type === "fixed-price"
        ? "discount"
        : promotion.type === "original" ? "no-discount" : "";
    resultCard.hidden = false;
}

function findHeader(headers, requiredName) {
    return headers.find((header) => String(header).trim().toLowerCase() === requiredName.toLowerCase());
}

function readPromotionFile(event) {
    const file = event.target.files[0];
    hideResult();
    PromotionRepository.clear();
    promotionFileLoaded = false;

    if (!file) {
        setFileStatus("No promotion file uploaded.");
        return;
    }

    if (!/\.(xlsx|xls|xlsm|xlsb)$/i.test(file.name)) {
        promotionFile.value = "";
        setFileStatus("Invalid Excel file. Please choose an Excel workbook.", "error");
        return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
        try {
            const workbook = XLSX.read(new Uint8Array(loadEvent.target.result), { type: "array" });
            const sheet = workbook.Sheets["1ST"];

            if (!sheet) {
                throw new Error('Missing the required "1ST" sheet.');
            }

            const table = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
            const headers = table[0] || [];
            const itemIdHeader = findHeader(headers, "itemid");
            const promotionHeader = findHeader(headers, "Promotion");

            if (!itemIdHeader || !promotionHeader) {
                throw new Error("Missing required columns: itemid and Promotion.");
            }

            const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
            const normalizedRows = rows.map((row) => ({
                itemid: row[itemIdHeader],
                Promotion: row[promotionHeader]
            }));

            PromotionRepository.load(normalizedRows);
            promotionFileLoaded = true;
            setFileStatus(`Promotion file loaded. ${PromotionRepository.promotions.size} item(s) available.`, "success");
        } catch (error) {
            promotionFile.value = "";
            PromotionRepository.clear();
            const validationMessage = /^(Missing the required|Missing required columns)/.test(error.message)
                ? error.message
                : "Invalid Excel file.";
            setFileStatus(validationMessage, "error");
        }
    };
    reader.onerror = () => {
        promotionFile.value = "";
        setFileStatus("Invalid Excel file.", "error");
    };
    reader.readAsArrayBuffer(file);
}

function searchPromotion(fromCamera = false) {
    const itemId = itemCodeInput.value.trim();
    hideResult();

    if (!promotionFileLoaded) {
        setFileStatus("No promotion file uploaded. Upload a file before searching.", "error");
        return;
    }

    if (!itemId) {
        setFileStatus("Enter or scan an item code to search.", "ready");
        itemCodeInput.focus();
        return;
    }

    if (!PromotionRepository.has(itemId)) {
        setFileStatus(
            fromCamera
                ? "Barcode scanned successfully, but the barcode was not found in the promotion file."
                : "Item not found in the promotion file.",
            "error"
        );
        return;
    }

    const promotion = PromotionParser.parse(PromotionRepository.get(itemId));
    showResult(itemId, promotion);
    setFileStatus(fromCamera ? "Barcode scanned successfully. Item found." : "Item found.", "success");
}

// js/scanner.js calls this function after its shared duplicate guard accepts a
// barcode. Keeping this adapter page-specific preserves the converter's logic.
window.searchBarcode = function searchPriceBarcode(scannedBarcode) {
    const barcode = String(scannedBarcode || "").trim();
    if (!barcode) return;

    // Begin releasing the current camera stream before the promotion lookup.
    // scanner.js owns the single scanner instance and safely handles repeated closes.
    window.closeScanner?.();
    itemCodeInput.value = barcode;
    searchPromotion(true);
};

promotionFile.addEventListener("change", readPromotionFile);
searchButton.addEventListener("click", searchPromotion);
itemCodeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") searchPromotion();
});

// Release camera hardware if the user navigates away while the overlay is open.
window.addEventListener("pagehide", () => {
    window.closeScanner?.();
});
