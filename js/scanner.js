const scanBtn = document.getElementById("scanBtn");
const video = document.getElementById("video");

const codeReader = new ZXing.BrowserMultiFormatReader();

let scanning = false;

scanBtn.addEventListener("click", startCamera);

async function startCamera() {

    if (scanning) return;

    scanning = true;

   
    video.style.display = "block";

    try {

        const devices = await codeReader.listVideoInputDevices();

        if (devices.length === 0) {

            alert("No camera found");

            scanning = false;

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

                if (error) {
                    return;
                }

            }
        );

    } catch (err) {

        console.error(err);

        alert("Unable to access camera.");

        scanning = false;

    }

}

function stopCamera() {

    codeReader.reset();

    video.style.display = "none";

    scanning = false;

}