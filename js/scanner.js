const scanBtn = document.getElementById("scanBtn");
const closeCameraBtn = document.getElementById("closeCameraBtn");

 const video = document.getElementById("video");

const codeReader = new ZXing.BrowserMultiFormatReader();

let scanning = false;

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

        const devices = await codeReader.listVideoInputDevices();

        if (devices.length === 0) {

            alert("No camera found");

            stopCamera();

            return;

        }

        const backCamera = devices.find(device => {

            const name = device.label.toLowerCase();

            return name.includes("back") || name.includes("rear");

        });

        const cameraId = backCamera
            ? backCamera.deviceId
            : devices[0].deviceId;

        codeReader.decodeFromVideoDevice(

            cameraId,

            video,

            (result, error) => {

                if (result) {

                    const barcode = result.getText();

                    window.searchBarcode(barcode);

                    stopCamera();

                }

                if (error) return;

            }

        );

    }

    catch (err) {

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