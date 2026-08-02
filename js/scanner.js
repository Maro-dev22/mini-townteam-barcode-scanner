const scanBtn = document.getElementById("scanBtn");
const closeCameraBtn = document.getElementById("closeCameraBtn");

const html5QrCode = new Html5Qrcode("reader");

let scanning = false;

let lastBarcode = "";
let lastScanTime = 0;

// =========================
// Events
// =========================

 scanBtn.addEventListener("click", startCamera);
closeCameraBtn.addEventListener("click", stopCamera);

// =========================
// Start Camera
// =========================

async function startCamera() {

    if (scanning) return;

    scanning = true;    openCameraOverlay();

    try {

        await html5QrCode.start(

            {
                facingMode: "environment"
            },

            {
                fps: 15,
                qrbox: {
                    width: 260,
                    height: 120
                },
                aspectRatio: 1.777
            },

            onScanSuccess,

            onScanFailure

        );

    }

    catch (err) {

        console.error(err);

        alert("Unable to access camera");

        stopCamera();

    }

} 

// =========================
// Success
// =========================

async function onScanSuccess(decodedText) {

    const now = Date.now();

    if (
        decodedText === lastBarcode &&
        now - lastScanTime < 1500
    ) {
        return;
    }

    lastBarcode = decodedText;
    lastScanTime = now;

    await stopCamera();

    window.searchBarcode(decodedText);

}

// =========================
// Ignore Errors
// =========================

function onScanFailure(error) {

    // Ignore

}
// =========================
// Stop Camera
// =========================

async function stopCamera() {

    if (!scanning) return;

    scanning = false;

    try {

        await html5QrCode.stop();

        await html5QrCode.clear();

    }

    catch (err) {

        console.log(err);

    }

    closeCameraOverlay();

}