const scanBtn = document.getElementById("scanBtn");
const closeCameraBtn = document.getElementById("closeCameraBtn");

 const video = document.getElementById("video");
const hints = new Map();

hints.set(
    ZXing.DecodeHintType.POSSIBLE_FORMATS,
    [
        ZXing.BarcodeFormat.CODE_128
    ]
);

const codeReader = new ZXing.BrowserMultiFormatReader(hints);

let scanning = false;
let lastBarcode = "";
let lastScanTime = 0;

// =========================
// Open Camera
// =========================

scanBtn.addEventListener("click", startCamera);

// =========================
// Close Camera
// =========================

closeCameraBtn.addEventListener("click", stopCamera);

// =========================
// Start Camera
// =========================

async function startCamera() {

    if (scanning) return;

    scanning = true;

    openCameraOverlay();
    video.style.display = "block";

    try {

        const cameraId = await getBackCamera();

        codeReader.decodeFromVideoDevice(
            cameraId,
            video,
            (result, error) => {

              if (result) {

    const barcode = result.getText();

    const now = Date.now();

    if (
        barcode === lastBarcode &&
        now - lastScanTime < 1500
    ) {
        return;
    }

    lastBarcode = barcode;
    lastScanTime = now;

    window.searchBarcode(barcode);

    stopCamera();

}

                if (error) return;

            }
        );

    } catch (err) {

        console.error(err);

        alert("Unable to access camera.");

        stopCamera();

    }

}


// =========================
// Stop Camera
// =========================

function stopCamera() {

    codeReader.reset();

    closeCameraOverlay();

    video.style.display = "none";

    scanning = false;

}
// =========================
// GetBackCamera
// =========================

async function getBackCamera() {

    const devices = await codeReader.listVideoInputDevices();

    if (devices.length === 0) {

        throw new Error("No camera found");

    }

    const backCamera = devices.find(device => {

        const name = device.label.toLowerCase();

        return name.includes("back") || name.includes("rear");

    });

    return backCamera
        ? backCamera.deviceId
        : devices[0].deviceId;

}