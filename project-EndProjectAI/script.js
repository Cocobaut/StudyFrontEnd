const WS_URL    = "ws://127.0.0.1:8765";
const THRESHOLD = 0.70;
const USE_CANVAS = true; // set false để test hiển thị trực tiếp <video>

const $messages    = document.getElementById('messages');
const $video       = document.getElementById('video');
const $canvas      = document.getElementById('canvas');
const $videoDot    = document.getElementById('video-dot');
const $badgeVideo  = document.getElementById('badge-video');
const $btnWS       = document.getElementById('btn-ws');
const $btnDemo     = document.getElementById('btn-demo');
const $hint        = document.getElementById('hint');
const $toggleCam   = document.getElementById('toggleCamBtn');


//Nút điều khiển camera----------------------------------------------------------------------------------------------------------------------
let camStream = null, rafId = null, videoActive = false;

// set canvas size khi có metadata
$video.addEventListener('loadedmetadata', () => {
    if ($canvas) {
    $canvas.width  = $video.videoWidth  || 640;
    $canvas.height = $video.videoHeight || 480;
    }
});

async function startCam() {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    $video.srcObject = camStream;
    await $video.play();

    const draw = () => {
    if ($video.readyState >= 2 && USE_CANVAS && $canvas && $canvas.width && $canvas.height) {
        const ctx = $canvas.getContext('2d');
        ctx.drawImage($video, 0, 0, $canvas.width, $canvas.height);
        // overlay grid (optional)
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        const tx = $canvas.width/3, ty = $canvas.height/3;
        ctx.beginPath();
        ctx.moveTo(tx,0); ctx.lineTo(tx,$canvas.height);
        ctx.moveTo(2*tx,0); ctx.lineTo(2*tx,$canvas.height);
        ctx.moveTo(0,ty); ctx.lineTo($canvas.width,ty);
        ctx.moveTo(0,2*ty); ctx.lineTo($canvas.width,2*ty);
        ctx.stroke();
    }
    rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);

    videoActive = true; updateVideoBadge();
    $toggleCam.textContent = 'Turn off camera';
}

function stopCam() {
    if (camStream) camStream.getVideoTracks().forEach(t => t.stop());
    camStream = null; 
    $video.srcObject = null;
    
    // Chuyển màn hình video sang màu đen
    if ($canvas && USE_CANVAS) {
        const ctx = $canvas.getContext('2d');
        ctx.fillStyle = '#000'; // Màu đen
        ctx.fillRect(0, 0, $canvas.width, $canvas.height); // Tô toàn bộ canvas
    }

    if (rafId) cancelAnimationFrame(rafId), rafId = null;
    videoActive = false; 
    updateVideoBadge();
    $toggleCam.textContent = 'Turn on camera';
}

$toggleCam.addEventListener('click', async () => {
    try { 
        camStream ? stopCam() : await startCam(); 
    }
    catch (e) { 
        console.error(e); alert('Không mở được camera. Dùng HTTPS hoặc http://localhost và cho phép quyền.'); 
    }
});

function updateVideoBadge() {
    if (videoActive && isSendingFrames) {
        $badgeVideo.textContent = 'Playing';
        $badgeVideo.classList.add('ok');
    } else if (videoActive) {
        $badgeVideo.textContent = 'Not playing';
        $badgeVideo.classList.remove('ok');
        $videoDot.style.background = '#22c55e'; 
    } else {
        $badgeVideo.textContent = 'Not playing';
        $badgeVideo.classList.remove('ok');
        $videoDot.style.background = '#ef4444';
    }
}


//Nút bắt đầu gửi ảnh từ camera để cho thủ ngữ có thể nhận diện---------------------------------------------------------------------------------
let isSendingFrames = false;
let sendInterval = null;

const $btnSendFrame = document.getElementById('btn-send-frame');

// Hàm gửi khung hình lên backend qua HTTP
async function sendFrameToBackend(frameBase64) {
    try {
        const response = await fetch('/upload-frame', { 
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ frame: frameBase64 }), 
        });

        if (response.ok) {
        console.log('Khung hình đã được gửi thành công.');
        } else {
        console.error('Không thể gửi khung hình tới backend.');
        }
    } catch (error) {
        console.error('Lỗi khi gửi khung hình:', error);
    }
}

// Hàm bắt đầu gửi khung hình
function startSendingFrames() {
    if (!videoActive) {
        alert("Camera chưa mở! Vui lòng mở camera trước.");
        return;
    }

    sendInterval = setInterval(() => {
        if (!USE_CANVAS || !$canvas) return;                        // Kiểm tra Canvas
        const frameBase64 = $canvas.toDataURL('image/jpeg');        // Lấy khung hình dạng Base64
        sendFrameToBackend(frameBase64);                            // Gửi frame lên backend
    }, 300); 
}

// Hàm dừng gửi khung hình
function stopSendingFrames() {
    if (sendInterval) {
        clearInterval(sendInterval);
        sendInterval = null;
    }
}

// Sự kiện cho nút "Bắt đầu gửi" hoặc "Ngừng gửi"
$btnSendFrame.addEventListener('click', () => {
    if (!isSendingFrames) {
        startSendingFrames();
        isSendingFrames = true;
        $btnSendFrame.textContent = 'Ngừng gửi';
    } else {
        stopSendingFrames();
        isSendingFrames = false;
        $btnSendFrame.textContent = 'Bắt đầu gửi';
    }
    updateVideoBadge();
});


//Gửi video lên backend--------------------------------------------------------------------------------------------------------------------------
const $fileInput = document.getElementById('video-file'); // Đầu vào để chọn file
const $btnUploadVideo = document.getElementById('btn-upload-video'); // Nút upload video
const $uploadStatus = document.getElementById('upload-status'); // Thông báo trạng thái tải

// Hàm gửi video lên backend
async function uploadVideo(file) {
  try {
    $uploadStatus.textContent = 'Đang tải video lên...'; // Hiển thị trạng thái

    // Tạo một FormData object để gửi tệp dưới dạng dạng "multipart/form-data"
    const formData = new FormData();
    formData.append('video', file); // Thêm file vào form

    // Gửi tệp tới backend qua API POST
    const response = await fetch('/upload-video', {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      const result = await response.json();
      console.log('Kết quả từ backend:', result);
      $uploadStatus.textContent = 'Tải video lên thành công!';
    } else {
      console.error('Lỗi khi tải video:', response.statusText);
      $uploadStatus.textContent = 'Tải video thất bại. Hãy thử lại.';
    }
  } catch (error) {
    console.error('Lỗi khi gửi video:', error);
    $uploadStatus.textContent = 'Tải lên thất bại. Hãy thử lại.';
  }
}

// Gắn sự kiện vào nút khi được nhấn
$btnUploadVideo.addEventListener('click', () => {
  const file = $fileInput.files[0]; // Lấy file đầu vào
  if (!file) {
    alert('Vui lòng chọn một tệp video!');
    return;
  }

  // Chỉ gửi nếu file đúng định dạng
  if (!file.type.startsWith('video/')) {
    alert('Chỉ hỗ trợ tệp video!');
    return;
  }

  uploadVideo(file); // Gọi hàm tải video lên backend
});


//Chat render-----------------------------------------------------------------------------------------------------------------------------------
function pushSystem(text){
    if(!text) return;
    const div = document.createElement('div');
    div.className = 'msg system';
    div.textContent = text;
    $messages.appendChild(div);
    $messages.scrollTop = $messages.scrollHeight;
    if ($hint) $hint.style.display = 'none';
}

let _last='', _lastAt=0;
function onRecognized(payload){
    const text = typeof payload==='string' ? payload : (payload?.text ?? '');
    const conf = typeof payload==='object' ? (payload.confidence ?? payload.score ?? 1) : 1;
    if (!videoActive || !text || conf < THRESHOLD) return;
    const now = Date.now(); if (text===_last && now-_lastAt<800) return;
    _last=text; _lastAt=now;
    pushSystem(text.trim());
}
window.onRecognized = onRecognized;


//Websocket (backend)---------------------------------------------------------------------------------------------------------------------------------
function connectWS(url = WS_URL) {
    const ws = new WebSocket(url);
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = 'WS…';
    document.querySelector('.actions').appendChild(badge);

    ws.onopen = () => {
        badge.textContent = 'WS connected';
        badge.classList.add('ok');
    };

    ws.onmessage = (e) => {
        let d = e.data;
        try {
        d = JSON.parse(e.data);
        } catch {}
        onRecognized(d);
    };

    ws.onerror = () => {
        badge.textContent = 'WS error';
    };

    ws.onclose = () => {
        badge.textContent = 'WS closed';

        setTimeout(() => {
            badge.remove(); 
        }, 2000); 
    };

    return ws;
}
document.getElementById('btn-ws').addEventListener('click', ()=>connectWS());


//Demo--------------------------------------------------------------------------------------------------------------------------------------------------------------
document.getElementById('btn-demo').addEventListener('click', ()=>{
    if (!videoActive) { videoActive = true; updateVideoBadge(); }
    const demo = ['Demo start','Nhận diện: Xin chào','Chuyển văn bản → chat','Kết thúc'];
    let i=0; const id=setInterval(()=>{ if(i<demo.length) onRecognized({text:demo[i++],confidence:0.95}); else clearInterval(id); },800);
});

// Seed
pushSystem('Panel is ready. Ready to get word from AI');