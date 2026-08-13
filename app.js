// ===== ตั้งค่า Firebase (เอาค่ามาจาก Firebase Console → Project settings → Your apps) =====
var firebaseConfig = {
  apiKey: "AIzaSyBjJLodAV1hkgaxxmgzvccMVAIW5S8hbqw",
  authDomain: "c2-calendar-c088f.firebaseapp.com",
  projectId: "c2-calendar-c088f",
  storageBucket: "c2-calendar-c088f.firebasestorage.app",
  messagingSenderId: "366484323689",
  appId: "1:366484323689:web:cce308b7968a77db3791f8"
};
firebase.initializeApp(firebaseConfig);
var fbAuth = firebase.auth();
var fbDb = firebase.firestore();
var fbFunctions = firebase.app().functions("asia-southeast1");
var fbStorage = firebase.storage();

// เตรียมไว้สำหรับอนาคต ถ้าได้ Google Maps API key มาแค่ใส่ค่าตรงนี้ระบบจะเปิดแผนที่ให้อัตโนมัติ
// ตอนนี้ปล่อยว่างไว้ - ฟอร์มจะไม่โชว์ข้อความอะไรเกี่ยวกับแผนที่เลย ใช้ช่องพิมพ์ชื่อสถานที่แทน
var GOOGLE_MAPS_API_KEY = '';

var TOKEN_KEY = 'c2tech_token';
var NAME_KEY = 'c2tech_admin_name';
var ROLE_KEY = 'c2tech_role';
var ACCOUNT_ID_KEY = 'c2tech_account_id';
var calendarInstance = null;

var Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2500,
  timerProgressBar: true
});

// ===== action ที่เรียกผ่าน Cloud Function ตรงๆ (เขียนข้อมูล + ที่มีเรื่อง permission ซับซ้อน) =====
var CLOUD_FUNCTION_ACTIONS = [
  'login', 'validateSessionCallable', 'addTask', 'updateTask', 'deleteTask',
  'getStaffList', 'getPublicStaffList', 'addStaff', 'updateStaff', 'resetPassword', 'setStaffActive', 'deleteStaff',
  'addHoliday', 'deleteHoliday',
  'requestDeleteTask', 'requestRescheduleTask', 'approveChangeRequest', 'rejectChangeRequest',
  'getMyProfile', 'updateOwnProfile', 'changeOwnPassword', 'markNotificationRead'
];

// ===== callApi: ยังใช้ชื่อ/รูปแบบเดิมทุกจุดที่เรียกในไฟล์นี้ แค่เปลี่ยนปลายทางข้างในเป็น Firebase =====
// action ที่อยู่ใน CLOUD_FUNCTION_ACTIONS -> ยิงผ่าน Cloud Function เหมือน Apps Script เดิม
// action อื่นๆ (getCalendarEvents, getHolidays, getUndatedTasks, getMyChangeRequests, getPendingChangeRequests, getTaskDetail)
//   -> จะทำเป็นอ่านตรงจาก Firestore แทนในรอบ 6.2 (ยังไม่ทำในรอบนี้)
function callApi(action, params) {
  params = params || {};

  if (CLOUD_FUNCTION_ACTIONS.indexOf(action) !== -1) {
    var fn = fbFunctions.httpsCallable(action);
    return fn(params).then(function (result) {
      return result.data;
    }).catch(function (err) {
      // ทำให้หน้าตา error คล้ายเดิม (โค้ดส่วนอื่นในไฟล์นี้คาดหวัง err.message)
      var e = new Error(err.message || 'เกิดข้อผิดพลาด');
      throw e;
    });
  }

  if (action === 'getTaskDetail') return firestoreGetTaskDetail(params);
  if (action === 'getUndatedTasks') return firestoreGetUndatedTasks();
  if (action === 'getMyChangeRequests') return firestoreGetMyChangeRequests();
  if (action === 'getPendingChangeRequests') return firestoreGetPendingChangeRequests();

  return Promise.resolve({ success: false, message: 'ไม่รู้จัก action: ' + action });
}

// ===== อ่านงาน 1 อันตรงจาก Firestore (แทนที่ getTaskDetail เดิม - ใช้ตอนเปิดฟอร์มแก้ไขงาน) =====
async function firestoreGetTaskDetail(params) {
  try {
    var doc = await fbDb.collection('tasks').doc(params.taskId).get();
    if (!doc.exists) return { success: false, message: 'ไม่พบงานนี้' };
    var row = doc.data();
    return {
      success: true,
      task: {
        taskId: doc.id,
        taskName: row.taskName,
        startDateTime: firestoreDateToIso(row.startDateTime),
        endDateTime: firestoreDateToIso(row.endDateTime),
        isAllDay: row.isAllDay,
        locationName: row.locationName,
        lat: row.lat,
        lng: row.lng,
        status: row.status,
        detail: row.detail,
        taskType: row.taskType,
        isUndated: row.isUndated,
        staffIds: row.staffIds || []
      }
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

function firestoreDateToIso(val) {
  var d = firestoreDateToJs(val);
  return d ? d.toISOString() : '';
}

// ===== อ่านรายการงานไม่ระบุวันที่ตรงจาก Firestore (แทนที่ getUndatedTasks เดิม - ใช้ทำ To-Do List) =====
async function firestoreGetUndatedTasks() {
  try {
    var snapshot = await fbDb.collection('tasks').where('isUndated', '==', true).get();
    var tasks = [];
    snapshot.docs.forEach(function (doc) {
      var row = doc.data();
      if (row.status === 'ยกเลิกงาน') return;
      var staff = (row.staffIds || []).map(function (id) {
        var s = staffMapCache[id];
        return s ? { name: s.firstName + ' ' + s.lastName, color: s.colorHex } : null;
      }).filter(function (s) { return s; });
      tasks.push({ taskId: doc.id, taskName: row.taskName, detail: row.detail, taskType: row.taskType, staff: staff });
    });
    return { success: true, tasks: tasks };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ===== อ่านคำขอของฉันตรงจาก Firestore (ใช้ ACCOUNT_ID_KEY ที่เก็บไว้ตอน login แทนการยิงถาม server ว่า token คือใคร) =====
async function firestoreGetMyChangeRequests() {
  try {
    var myId = localStorage.getItem(ACCOUNT_ID_KEY);
    var snapshot = await fbDb.collection('changeRequests').where('requestedBy', '==', myId).get();
    var requests = await buildChangeRequestListFromDocs(snapshot.docs);
    return { success: true, requests: requests };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ===== อ่านคำขอที่รออนุมัติทั้งหมดตรงจาก Firestore (สำหรับ Admin) =====
async function firestoreGetPendingChangeRequests() {
  try {
    var snapshot = await fbDb.collection('changeRequests').where('status', '==', 'pending').get();
    var requests = await buildChangeRequestListFromDocs(snapshot.docs);
    return { success: true, requests: requests };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ===== ฟังก์ชันกลาง: join ชื่องาน + ชื่อผู้ขอ ให้คำขอแต่ละรายการ (แทนที่ buildChangeRequestList เดิมของ ChangeRequestData.gs) =====
async function buildChangeRequestListFromDocs(docs) {
  var results = [];
  for (var i = 0; i < docs.length; i++) {
    var row = docs[i].data();
    var taskName = '(ไม่พบงานนี้แล้ว)';
    try {
      var taskDoc = await fbDb.collection('tasks').doc(row.taskId).get();
      if (taskDoc.exists) taskName = taskDoc.data().taskName;
    } catch (e) { /* ไม่พบงาน ปล่อยผ่านใช้ค่า default */ }

    var requesterName = '-';
    var s = staffMapCache[row.requestedBy];
    if (s) requesterName = s.firstName + ' ' + s.lastName;

    results.push({
      requestId: docs[i].id,
      taskId: row.taskId,
      taskName: taskName,
      requestType: row.requestType,
      requestedBy: row.requestedBy,
      requestedByName: requesterName,
      requestedAt: firestoreDateToIso(row.requestedAt),
      status: row.status,
      newStartDateTime: firestoreDateToIso(row.newStartDateTime),
      newEndDateTime: firestoreDateToIso(row.newEndDateTime),
      reason: row.reason || ''
    });
  }
  results.sort(function (a, b) { return new Date(b.requestedAt) - new Date(a.requestedAt); });
  return results;
}

// ===== ตัวช่วยแสดงสถานะ loading บนปุ่ม กันกดซ้ำและให้รู้ว่ากดสำเร็จ =====
// ===== สลับโชว์/ซ่อนรหัสผ่านในช่อง input (กดปุ่มตา) =====
function togglePasswordVisibility(inputId, btn) {
  var input = document.getElementById(inputId);
  var showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  btn.textContent = showing ? '👁' : '🙈';
}

function setButtonLoading(btn, loading, loadingText) {
  if (loading) {
    btn.dataset.originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> ' + (loadingText || 'กำลังบันทึก...');
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
  }
}

// ===== ซ่อน splash screen ตอนปฏิทินโหลดข้อมูลรอบแรกเสร็จ =====
function hidePageLoading() {
  var el = document.getElementById('page-loading');
  if (!el) return;
  el.classList.add('fade-out');
  setTimeout(function () { el.style.display = 'none'; }, 400);
}

var holidaysCache = [];

// ===== Local Cache (เก็บในเบราว์เซอร์) แบบ Stale-While-Revalidate =====
// ใช้เฉพาะรายชื่อผู้ปฏิบัติงาน (accounts อ่านตรงจาก Firestore ไม่ได้ ต้องผ่าน Cloud Function เท่านั้น)
// ส่วนวันหยุด/ปฏิทินงาน เปลี่ยนไปใช้ real-time listener ของ Firestore แทนแล้ว (เร็วกว่าและไม่ต้องมี local cache อีก)
var LOCAL_CACHE_TTL_MS = 60 * 60 * 1000; // 1 ชม. - หมดอายุสำรอง กันโชว์ข้อมูลเก่าเกินไปถ้าเน็ตมีปัญหานาน
var STAFF_CACHE_KEY = 'c2tech_cache_staff_public';

function getLocalCache(key) {
  try {
    var raw = localStorage.getItem(key);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > LOCAL_CACHE_TTL_MS) return null;
    return parsed.data;
  } catch (e) {
    return null;
  }
}

function setLocalCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ data: data, timestamp: Date.now() }));
  } catch (e) {
    // localStorage เต็มหรือใช้งานไม่ได้ - ปล่อยผ่านเงียบๆ ไม่กระทบการทำงานหลัก
  }
}

// ===== ประเภทงาน -> สี (เดิมฝั่ง server เป็นคน map ให้ ตอนนี้ต้องทำเองฝั่ง client) =====
var TASK_TYPE_COLORS = { meeting: '#FCE38A', onsite: '#FFB48A', event: '#C9A6FF', leave: '#E5E7EB' };
function getTaskTypeColor(t) { return TASK_TYPE_COLORS[t] || '#cccccc'; }
function getTaskTypeTextColor(t) { return getContrastTextColor(getTaskTypeColor(t)); }

// ===== จับคู่ staffId -> ข้อมูลคน (เดิมฝั่ง server join ให้ ตอนนี้ทำเองฝั่ง client จาก staffMapCache) =====
var staffMapCache = {};
var lastRenderedEvents = [];

function firestoreDateToJs(val) {
  if (!val) return null;
  return val.toDate ? val.toDate() : new Date(val);
}

// ===== แปลงเอกสารงานจาก Firestore เป็น event รูปแบบ FullCalendar (แทนที่ buildCalendarEvents เดิมของ Data.gs) =====
function buildEventsFromTaskDocs(docs) {
  var events = [];
  docs.forEach(function (docSnap) {
    var row = docSnap.data();
    if (row.status === 'ยกเลิกงาน') return; // งานที่ถูกลบแบบ soft delete ไม่โชว์
    if (row.isUndated) return; // งานไม่ระบุวันที่ ไปโชว์ที่ To-Do List แทน
    if (!row.startDateTime) return;

    var assignedStaff = (row.staffIds || []).map(function (id) {
      var s = staffMapCache[id];
      return s ? { name: s.firstName + ' ' + s.lastName, color: s.colorHex } : null;
    }).filter(function (s) { return s; });

    var start = firestoreDateToJs(row.startDateTime);
    var end = firestoreDateToJs(row.endDateTime) || start;
    var displayEnd = end;
    if (row.isAllDay) {
      displayEnd = new Date(end.getTime() + 86400000); // FullCalendar ถือ end แบบ exclusive ต้อง +1 วัน
    }

    events.push({
      id: docSnap.id,
      title: row.taskName,
      start: start.toISOString(),
      end: displayEnd.toISOString(),
      allDay: row.isAllDay,
      color: getTaskTypeColor(row.taskType),
      textColor: getTaskTypeTextColor(row.taskType),
      extendedProps: {
        location: row.locationName,
        lat: row.lat,
        lng: row.lng,
        status: row.status,
        detail: row.detail,
        taskType: row.taskType,
        createdBy: row.createdBy,
        staffIds: row.staffIds || [],
        staff: assignedStaff
      }
    });
  });
  return events;
}

// ===== ฟังการเปลี่ยนแปลงงานแบบ real-time (แทนที่ loadPublicEvents/loadAdminEvents เดิม) =====
// อ่านได้ทุกคนเสมอ (แม้ไม่ login) ตาม Security Rules ที่ตั้งไว้ - ไม่ต้องแยก public/admin อีกต่อไป
var lastTaskDocs = [];

function setupTasksRealtimeListener() {
  fbDb.collection('tasks').onSnapshot(function (snapshot) {
    lastTaskDocs = snapshot.docs;
    lastRenderedEvents = buildEventsFromTaskDocs(snapshot.docs);
    renderCalendar({ success: true, events: lastRenderedEvents });
  }, function (err) {
    console.error('ฟังการเปลี่ยนแปลงงานไม่สำเร็จ', err);
  });
}

// ===== ฟังการเปลี่ยนแปลงวันหยุดแบบ real-time (แทนที่ loadHolidays เดิม) =====
function setupHolidaysRealtimeListener() {
  fbDb.collection('holidays').onSnapshot(function (snapshot) {
    holidaysCache = snapshot.docs.map(function (d) {
      var row = d.data();
      return { holidayId: d.id, type: row.type, value: row.value, name: row.name };
    });
    refreshCalendarDayCells(); // dayCellDidMount ไม่รันซ้ำเอง ต้องบังคับสร้างปฏิทินใหม่
  }, function (err) {
    console.error('ฟังการเปลี่ยนแปลงวันหยุดไม่สำเร็จ', err);
  });
}

// ===== บังคับสร้างปฏิทินใหม่ (ใช้ตอนวันหยุด/ชื่อผู้ปฏิบัติงานเปลี่ยน ที่ dayCellDidMount ไม่รันซ้ำเอง) =====
// สร้าง event ใหม่จาก lastTaskDocs + staffMapCache ล่าสุดเสมอ (ไม่ใช้ lastRenderedEvents เก่าที่อาจสร้างไว้ตอนยังไม่มีข้อมูลสี)
function refreshCalendarDayCells() {
  if (!calendarInstance) return;
  lastRenderedEvents = buildEventsFromTaskDocs(lastTaskDocs);
  calendarInstance.destroy();
  calendarInstance = null;
  renderCalendar({ success: true, events: lastRenderedEvents });
}

// ทุกคนเห็นปฏิทินได้เสมอตั้งแต่เปิดหน้าเว็บ ไม่ต้อง login
// ไม่ต้องมี local cache/stale-while-revalidate อีกต่อไป เพราะ Firestore real-time เร็วกว่าและทำงานแทนได้ดีกว่าอยู่แล้ว
window.onload = function () {
  loadMemberSidebar();
  setupHolidaysRealtimeListener();
  setupTasksRealtimeListener();
  checkExistingSession();
  loadTodoList();

  ['username', 'password'].forEach(function (id) {
    var el = document.getElementById(id);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doLogin();
    });
    el.addEventListener('input', function () {
      document.getElementById('login-error-text').style.display = 'none';
    });
  });
};

// เก็บชื่อฟังก์ชันไว้ให้จุดที่เรียกใช้เดิมยังทำงานได้ (คืน Promise เปล่าๆ) แต่ไม่ต้องทำอะไรจริงแล้ว
// เพราะ setupHolidaysRealtimeListener() อัปเดต holidaysCache + รีเฟรชปฏิทินอัตโนมัติทุกครั้งที่ข้อมูลเปลี่ยนอยู่แล้ว
function loadHolidays() {
  return Promise.resolve({ success: true, holidays: holidaysCache });
}

var WEEKDAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

function renderMonthHolidayList(start, end) {
  var container = document.getElementById('month-holiday-list');
  if (!container) return;

  var matched = holidaysCache
    .filter(function (h) { return h.type === 'date'; })
    .filter(function (h) {
      var hd = new Date(h.value);
      return hd >= start && hd < end;
    })
    .sort(function (a, b) { return a.value < b.value ? -1 : 1; });

  if (matched.length === 0) {
    container.innerHTML = '<p style="font-size:12px;color:#9aa1a8">ไม่มีวันหยุดในเดือนนี้</p>';
    return;
  }
  container.innerHTML = '';
  matched.forEach(function (h) {
    var d = new Date(h.value);
    var row = document.createElement('div');
    row.className = 'month-holiday-item';
    row.innerHTML =
      '<span class="mh-date">' + d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) + '</span>' +
      '<span class="mh-name">' + h.name + '</span>';
    container.appendChild(row);
  });
}

function formatEventDateRange(event) {
  var start = event.start;
  var end = event.end;
  var opts = { day: 'numeric', month: 'short' };
  var timeOpts = { hour: '2-digit', minute: '2-digit' };

  if (event.allDay) {
    // FullCalendar เก็บ end แบบ exclusive ต้อง -1 วัน ให้ตรงกับวันที่โชว์จริง
    var displayEnd = end ? new Date(end.getTime() - 86400000) : start;
    var sameDay = displayEnd.toDateString() === start.toDateString();
    if (sameDay) return start.toLocaleDateString('th-TH', opts);
    return start.toLocaleDateString('th-TH', opts) + ' - ' + displayEnd.toLocaleDateString('th-TH', opts);
  }

  if (!end) return start.toLocaleDateString('th-TH', opts) + ' ' + start.toLocaleTimeString('th-TH', timeOpts);

  var sameDayTimed = start.toDateString() === end.toDateString();
  if (sameDayTimed) {
    return start.toLocaleDateString('th-TH', opts) + ' ' + start.toLocaleTimeString('th-TH', timeOpts) +
      ' - ' + end.toLocaleTimeString('th-TH', timeOpts);
  }
  return start.toLocaleDateString('th-TH', opts) + ' ' + start.toLocaleTimeString('th-TH', timeOpts) +
    ' - ' + end.toLocaleDateString('th-TH', opts) + ' ' + end.toLocaleTimeString('th-TH', timeOpts);
}

function getOverlappingHolidays(startDateTime, endDateTime) {
  var start = new Date(startDateTime); start.setHours(0, 0, 0, 0);
  var end = new Date(endDateTime); end.setHours(0, 0, 0, 0);
  var matched = [];

  holidaysCache.forEach(function (h) {
    if (h.type === 'date') {
      var hd = new Date(h.value); hd.setHours(0, 0, 0, 0);
      if (hd >= start && hd <= end) matched.push(h);
    } else {
      var cursor = new Date(start);
      var found = false;
      while (cursor <= end && !found) {
        if (cursor.getDay() === h.value) found = true;
        cursor.setDate(cursor.getDate() + 1);
      }
      if (found) matched.push(h);
    }
  });

  return matched;
}

function checkExistingSession() {
  var token = localStorage.getItem(TOKEN_KEY);
  var name = localStorage.getItem(NAME_KEY);
  if (!token) return;

  callApi('validateSessionCallable', { token: token }).then(function (result) {
    if (result.valid) {
      localStorage.setItem(ROLE_KEY, result.role);
      localStorage.setItem(ACCOUNT_ID_KEY, result.accountId);
      enterAdminMode(name, result.role);
      loadAdminEvents(token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(NAME_KEY);
    }
  });
}

function openLoginModal() {
  document.getElementById('login-modal-overlay').style.display = 'flex';
  document.getElementById('login-error-text').style.display = 'none';
  document.getElementById('username').focus();
}
function closeLoginModal() {
  document.getElementById('login-modal-overlay').style.display = 'none';
  document.getElementById('login-error-text').style.display = 'none';
}

function showLoginError(message) {
  var errorText = document.getElementById('login-error-text');
  errorText.textContent = message;
  errorText.style.display = 'block';

  var box = document.getElementById('login-box');
  box.classList.remove('shake');
  // trick บังคับ reflow ให้ animation เล่นซ้ำได้ถ้ากดผิดติดกันหลายครั้ง
  void box.offsetWidth;
  box.classList.add('shake');
  setTimeout(function () { box.classList.remove('shake'); }, 450);
}

function doLogin() {
  var username = document.getElementById('username').value.trim();
  var password = document.getElementById('password').value;

  if (!username || !password) {
    showLoginError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
    return;
  }

  var btn = document.getElementById('login-submit-btn');
  setButtonLoading(btn, true, 'กำลังเข้าสู่ระบบ...');

  callApi('login', { username: username, password: password }).then(function (result) {
    if (result.success) {
      // ขั้นตอนสำคัญ: เอา Firebase Custom Token ไปยื่นให้ Firebase Auth
      // เพื่อให้ Security Rules มองเห็นว่า "login อยู่แล้ว" ตอนอ่านข้อมูลแบบ real-time (Phase 6.2)
      return fbAuth.signInWithCustomToken(result.firebaseCustomToken).then(function () {
        localStorage.setItem(TOKEN_KEY, result.token);
        localStorage.setItem(NAME_KEY, result.fullName);
        localStorage.setItem(ROLE_KEY, result.role);
        localStorage.setItem(ACCOUNT_ID_KEY, result.accountId);
        closeLoginModal();
        enterAdminMode(result.fullName, result.role);
        loadAdminEvents(result.token);
        Toast.fire({ icon: 'success', title: 'เข้าสู่ระบบสำเร็จ ยินดีต้อนรับ ' + result.fullName });
      });
    } else {
      showLoginError(result.message);
    }
  }).catch(function (err) {
    showLoginError('เชื่อมต่อ API ไม่ได้: ' + err.message);
  }).finally(function () {
    setButtonLoading(btn, false);
  });
}

function doLogout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NAME_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(ACCOUNT_ID_KEY);
  fbAuth.signOut();
  exitAdminMode();
  loadPublicEvents();
  Toast.fire({ icon: 'info', title: 'ออกจากระบบแล้ว' });
}

function enterAdminMode(fullName, role) {
  document.getElementById('login-icon-btn').style.display = 'none';
  document.getElementById('admin-chip').style.display = 'flex';
  document.getElementById('admin-name').textContent = fullName || 'แอดมิน';
  var isAdmin = role === 'admin';
  var isStaff = role === 'staff';
  var isAdminOrCeo = role === 'admin' || role === 'ceo';
  document.getElementById('staff-menu-btn').style.display = isAdmin ? 'inline-block' : 'none';
  document.getElementById('holiday-menu-btn').style.display = isAdmin ? 'inline-block' : 'none';
  document.getElementById('export-excel-btn').style.display = isAdminOrCeo ? 'inline-block' : 'none';
  document.getElementById('dashboard-btn').style.display = isAdminOrCeo ? 'inline-block' : 'none';
  document.getElementById('notif-bell-btn').style.display = 'inline-flex'; // ทุก role ที่ login แล้วเห็นกระดิ่งเดียวกันหมด
  document.getElementById('task-undated-row').style.display = isAdmin ? 'flex' : 'none';
  requestNotificationPermission();
  setupNotificationsRealtimeListener();
  loadTodoList();
}

function exitAdminMode() {
  document.getElementById('login-icon-btn').style.display = 'flex';
  document.getElementById('admin-chip').style.display = 'none';
  document.getElementById('task-undated-row').style.display = 'none';
  document.getElementById('notif-bell-btn').style.display = 'none';
  document.getElementById('export-excel-btn').style.display = 'none';
  document.getElementById('dashboard-btn').style.display = 'none';
  lastNotifications = [];
  isFirstNotifSnapshot = true;
  loadTodoList();
}

function openStaffModal() {
  document.getElementById('staff-modal-overlay').style.display = 'flex';
  loadStaffList();
}
function closeStaffModal() {
  document.getElementById('staff-modal-overlay').style.display = 'none';
  cancelEditStaff();
  loadMemberSidebar();
}

function loadStaffList() {
  var token = localStorage.getItem(TOKEN_KEY);
  callApi('getStaffList', { token: token }).then(renderStaffList).catch(function (err) {
    console.error('โหลดรายชื่อผู้ปฏิบัติงานไม่สำเร็จ', err);
  });
}

var ROLE_LABELS = { admin: 'Admin', ceo: 'CEO', staff: 'Staff' };

function renderStaffList(result) {
  var container = document.getElementById('staff-list');
  if (!result.success) {
    container.innerHTML = '<p style="font-size:13px;color:#b91c1c">' + result.message + '</p>';
    return;
  }

  container.innerHTML = '';
  result.staff.forEach(function (s) {
    var row = document.createElement('div');
    row.className = 'staff-row';
    row.innerHTML =
      '<span class="staff-dot" style="background:' + s.colorHex + '"></span>' +
      '<div class="staff-info">' +
        '<p class="name">' + s.firstName + ' ' + s.lastName + '</p>' +
        '<p class="pos">' + (s.position || '-') + '</p>' +
      '</div>' +
      '<span class="role-badge ' + s.role + '">' + (ROLE_LABELS[s.role] || s.role) + '</span>' +
      '<button class="row-edit-btn" onclick=\'startEditStaff(' + JSON.stringify(s) + ')\'>แก้ไข</button>' +
      '<button class="row-edit-btn" onclick="resetPasswordConfirm(this, \'' + s.staffId + '\', \'' + (s.firstName + ' ' + s.lastName).replace(/'/g, '') + '\')">รีเซ็ตรหัส</button>' +
      '<button class="row-edit-btn danger" onclick="deleteStaffConfirm(this, \'' + s.staffId + '\', \'' + (s.firstName + ' ' + s.lastName).replace(/'/g, '') + '\')">ลบบัญชี</button>' +
      '<label style="font-size:12px;display:flex;align-items:center;gap:4px">' +
        '<input type="checkbox" ' + (s.active ? 'checked' : '') + ' onchange="toggleStaffActive(this, \'' + s.staffId + '\', this.checked)">' +
        'ใช้งาน' +
      '</label>';
    container.appendChild(row);
  });
}

var editingStaffId = null;

function toggleStaffAddForm() {
  var form = document.getElementById('staff-form');
  var isHidden = form.style.display === 'none';
  form.style.display = isHidden ? 'block' : 'none';
  document.getElementById('staff-form-toggle-btn').style.display = isHidden ? 'none' : 'block';
}

function startEditStaff(s) {
  document.getElementById('staff-form').style.display = 'block';
  document.getElementById('staff-form-toggle-btn').style.display = 'none';
  editingStaffId = s.staffId;
  document.getElementById('staff-username-field').style.display = 'none';
  document.getElementById('staff-firstname').value = s.firstName;
  document.getElementById('staff-lastname').value = s.lastName;
  document.getElementById('staff-position').value = s.position || '';
  document.getElementById('staff-phone').value = s.phone || '';
  document.getElementById('staff-color').value = s.colorHex || '#378ADD';
  document.getElementById('staff-role').value = s.role || 'staff';
  document.getElementById('staff-gender').value = s.gender || '';
  document.getElementById('staff-birthdate').value = s.birthDate || '';
  document.getElementById('staff-form-title').textContent = 'แก้ไขบัญชีผู้ใช้';
  document.getElementById('staff-submit-btn').textContent = 'บันทึกการแก้ไข';
  document.getElementById('staff-cancel-edit-btn').style.display = 'block';
  document.getElementById('staff-box').scrollTop = document.getElementById('staff-box').scrollHeight;
}

function cancelEditStaff() {
  editingStaffId = null;
  document.getElementById('staff-form').style.display = 'none';
  document.getElementById('staff-form-toggle-btn').style.display = 'block';
  document.getElementById('staff-username-field').style.display = 'block';
  document.getElementById('staff-username').value = '';
  document.getElementById('staff-firstname').value = '';
  document.getElementById('staff-lastname').value = '';
  document.getElementById('staff-position').value = '';
  document.getElementById('staff-phone').value = '';
  document.getElementById('staff-color').value = '#378ADD';
  document.getElementById('staff-role').value = 'staff';
  document.getElementById('staff-gender').value = '';
  document.getElementById('staff-birthdate').value = '';
  document.getElementById('staff-form-title').textContent = 'เพิ่มบัญชีผู้ใช้ใหม่';
  document.getElementById('staff-submit-btn').textContent = 'เพิ่มบัญชีผู้ใช้';
  document.getElementById('staff-cancel-edit-btn').style.display = 'none';
}

function submitAddStaff() {
  var firstName = document.getElementById('staff-firstname').value.trim();
  var lastName = document.getElementById('staff-lastname').value.trim();
  var position = document.getElementById('staff-position').value.trim();
  var phone = document.getElementById('staff-phone').value.trim();
  var colorHex = document.getElementById('staff-color').value;
  var username = document.getElementById('staff-username').value.trim();
  var role = document.getElementById('staff-role').value;
  var btn = document.getElementById('staff-submit-btn');

  if (!firstName || !lastName) {
    Swal.fire({ icon: 'warning', title: 'กรอกข้อมูลไม่ครบ', text: 'กรุณากรอกชื่อและนามสกุล' });
    return;
  }
  if (!editingStaffId && !username) {
    Swal.fire({ icon: 'warning', title: 'กรอกข้อมูลไม่ครบ', text: 'กรุณากำหนด Username สำหรับเข้าสู่ระบบ' });
    return;
  }

  var token = localStorage.getItem(TOKEN_KEY);
  var action = editingStaffId ? 'updateStaff' : 'addStaff';
  var payload = {
    token: token, firstName: firstName, lastName: lastName,
    position: position, phone: phone, colorHex: colorHex, role: role,
    gender: document.getElementById('staff-gender').value,
    birthDate: document.getElementById('staff-birthdate').value
  };
  if (editingStaffId) {
    payload.staffId = editingStaffId;
  } else {
    payload.username = username;
  }

  setButtonLoading(btn, true, editingStaffId ? 'กำลังบันทึก...' : 'กำลังเพิ่ม...');
  callApi(action, payload).then(function (result) {
    if (result.success) {
      cancelEditStaff();
      loadStaffList();
      if (result.generatedPassword) {
        Swal.fire({
          icon: 'success', title: 'เพิ่มผู้ปฏิบัติงานแล้ว',
          html: 'บัญชีเข้าสู่ระบบที่สร้างให้อัตโนมัติ:<br>' +
            '<b>Username:</b> ' + result.username + '<br>' +
            '<b>Password:</b> ' + result.generatedPassword + '<br><br>' +
            '<span style="font-size:12px;color:#9a7b1f">กรุณาแจ้งให้ผู้ปฏิบัติงานคนนี้ทราบ และเปลี่ยนรหัสผ่านทันทีที่ login ครั้งแรก</span>',
          confirmButtonText: 'รับทราบแล้ว'
        });
      } else {
        Toast.fire({ icon: 'success', title: 'บันทึกการแก้ไขแล้ว' });
      }
    } else {
      Swal.fire({ icon: 'error', title: 'ไม่สำเร็จ', text: result.message });
    }
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
  }).finally(function () {
    setButtonLoading(btn, false);
  });
}

function resetPasswordConfirm(btn, staffId, name) {
  Swal.fire({
    icon: 'warning', title: 'รีเซ็ตรหัสผ่านของ ' + name + '?',
    text: 'ระบบจะสุ่มรหัสผ่านใหม่ให้ทันที รหัสผ่านเดิมจะใช้ไม่ได้อีก',
    showCancelButton: true, confirmButtonText: 'รีเซ็ต', cancelButtonText: 'ยกเลิก'
  }).then(function (res) {
    if (!res.isConfirmed) return;
    var token = localStorage.getItem(TOKEN_KEY);
    setButtonLoading(btn, true, 'กำลังรีเซ็ต...');
    callApi('resetPassword', { token: token, staffId: staffId }).then(function (result) {
      if (result.success) {
        Swal.fire({
          icon: 'success', title: 'รีเซ็ตรหัสผ่านแล้ว',
          html: 'รหัสผ่านใหม่ของ <b>' + result.username + '</b>:<br>' +
            '<span style="font-size:18px;font-weight:600">' + result.newPassword + '</span><br><br>' +
            '<span style="font-size:12px;color:#9a7b1f">กรุณาแจ้งให้เจ้าของบัญชีทราบและเปลี่ยนรหัสผ่านทันทีที่ login ครั้งแรก</span>',
          confirmButtonText: 'รับทราบแล้ว'
        });
      } else {
        Swal.fire({ icon: 'error', title: 'ไม่สำเร็จ', text: result.message });
      }
    }).catch(function (err) {
      Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
    }).finally(function () {
      setButtonLoading(btn, false);
    });
  });
}

// ===== ลบบัญชีผู้ใช้ถาวร - ให้พิมพ์ชื่อยืนยันซ้ำก่อน เพราะกู้คืนไม่ได้ (ต่างจากปิดใช้งานที่แค่ toggle) =====
function deleteStaffConfirm(btn, staffId, name) {
  Swal.fire({
    icon: 'error',
    title: 'ลบบัญชีของ ' + name + ' ถาวร?',
    html: '<p style="font-size:13px;color:#6b7280">การลบนี้กู้คืนไม่ได้ ต่างจากการ "ปิดใช้งาน" — ประวัติงานเก่าที่เคยผูกกับคนนี้จะโชว์ "ไม่พบผู้ปฏิบัติงานนี้แล้ว" แทน<br><br>พิมพ์ชื่อเต็ม <b>' + name + '</b> เพื่อยืนยัน</p>',
    input: 'text',
    inputPlaceholder: name,
    showCancelButton: true,
    confirmButtonText: 'ลบถาวร',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#ef4444',
    inputValidator: function (value) {
      if (value !== name) return 'พิมพ์ชื่อให้ตรงกับ "' + name + '" เป๊ะๆก่อนถึงจะลบได้';
    }
  }).then(function (res) {
    if (!res.isConfirmed) return;
    var token = localStorage.getItem(TOKEN_KEY);
    setButtonLoading(btn, true, 'กำลังลบ...');
    callApi('deleteStaff', { token: token, staffId: staffId }).then(function (result) {
      if (result.success) {
        Toast.fire({ icon: 'success', title: 'ลบบัญชีถาวรแล้ว' });
        loadStaffList();
      } else {
        Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: result.message });
      }
    }).catch(function (err) {
      Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
    }).finally(function () {
      setButtonLoading(btn, false);
    });
  });
}

function toggleStaffActive(checkboxEl, staffId, active) {
  var token = localStorage.getItem(TOKEN_KEY);
  checkboxEl.disabled = true;
  callApi('setStaffActive', { token: token, staffId: staffId, active: active }).then(function (result) {
    if (result.success) {
      Toast.fire({ icon: 'success', title: active ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว' });
    } else {
      Swal.fire({ icon: 'error', title: 'อัปเดตไม่สำเร็จ', text: result.message });
    }
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
  }).finally(function () {
    checkboxEl.disabled = false;
  });
}

// ===== ฟอร์มสร้างงานใหม่ / แก้ไขงาน =====
var mapsLoaded = false;
var taskMap = null;
var taskMarker = null;
var editingTaskId = null;

function openTaskModal() {
  editingTaskId = null;
  resetTaskForm();
  document.getElementById('task-box').querySelector('h2').textContent = '📝 สร้างงานใหม่';
  document.getElementById('task-submit-btn').textContent = 'บันทึกงาน';
  document.getElementById('task-modal-overlay').style.display = 'flex';
  loadTaskStaffChecklist([]);
  setupTaskMap();
}

function openTaskModalForEdit(taskId) {
  var token = localStorage.getItem(TOKEN_KEY);
  // ยิง getTaskDetail และ getStaffList พร้อมกันเลย (ไม่เกี่ยวข้องกัน ไม่ต้องรอทีละรอบ)
  Promise.all([
    callApi('getTaskDetail', { token: token, taskId: taskId }),
    callApi('getStaffList', { token: token })
  ]).then(function (results) {
    var result = results[0];
    var staffListResult = results[1];
    if (!result.success) {
      Swal.fire({ icon: 'error', title: 'โหลดข้อมูลงานไม่สำเร็จ', text: result.message });
      return;
    }
    var task = result.task;
    editingTaskId = task.taskId;
    resetTaskForm();
    document.getElementById('task-box').querySelector('h2').textContent = '📝 แก้ไขงาน';
    document.getElementById('task-submit-btn').textContent = 'บันทึกการแก้ไข';

    document.getElementById('task-name').value = task.taskName;
    document.getElementById('task-type').value = task.taskType || 'meeting';
    document.getElementById('task-undated').checked = task.isUndated;
    toggleUndatedFields();

    if (!task.isUndated) {
      document.getElementById('task-allday').checked = task.isAllDay;
      var start = new Date(task.startDateTime);
      var end = new Date(task.endDateTime);

      if (task.isAllDay) {
        var days = Math.round((end - start) / 86400000) + 1;
        document.getElementById('task-start-date').value = start.toISOString().slice(0, 10);
        document.getElementById('task-duration').value = days;
      } else {
        document.getElementById('task-start-date-t').value = start.toISOString().slice(0, 10);
        document.getElementById('task-start-time').value = start.toTimeString().slice(0, 5);
        document.getElementById('task-end-date-t').value = end.toISOString().slice(0, 10);
        document.getElementById('task-end-time').value = end.toTimeString().slice(0, 5);
      }
      toggleAllDayFields();
    }
    document.getElementById('task-location').value = task.locationName || '';
    document.getElementById('task-detail').value = task.detail || '';

    document.getElementById('task-modal-overlay').style.display = 'flex';
    renderTaskStaffChecklist(staffListResult, task.staffIds || []);
    setupTaskMap();
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
  });
}

function closeTaskModal() {
  document.getElementById('task-modal-overlay').style.display = 'none';
}

function resetTaskForm() {
  document.getElementById('task-name').value = '';
  document.getElementById('task-type').value = 'meeting';
  document.getElementById('task-undated').checked = false;
  document.getElementById('task-allday').checked = true;
  document.getElementById('task-start-date').value = '';
  document.getElementById('task-duration').value = 1;
  document.getElementById('task-start-date-t').value = '';
  document.getElementById('task-start-time').value = '09:00';
  document.getElementById('task-end-date-t').value = '';
  document.getElementById('task-end-time').value = '12:00';
  document.getElementById('task-location').value = '';
  document.getElementById('task-detail').value = '';
  toggleAllDayFields();
  toggleUndatedFields();
  if (taskMarker) taskMarker.setMap(null);
  taskMarker = null;
}

function toggleUndatedFields() {
  var isUndated = document.getElementById('task-undated').checked;
  document.getElementById('task-date-section').style.display = isUndated ? 'none' : 'block';
}

function toggleAllDayFields() {
  var isAllDay = document.getElementById('task-allday').checked;
  document.getElementById('allday-fields').style.display = isAllDay ? 'flex' : 'none';
  document.getElementById('timed-fields').style.display = isAllDay ? 'none' : 'block';
}

function loadTaskStaffChecklist(selectedIds) {
  selectedIds = selectedIds || [];
  var token = localStorage.getItem(TOKEN_KEY);
  callApi('getStaffList', { token: token }).then(function (result) {
    renderTaskStaffChecklist(result, selectedIds);
  });
}

function renderTaskStaffChecklist(result, selectedIds) {
  selectedIds = selectedIds || [];
  var myRole = localStorage.getItem(ROLE_KEY);
  var myAccountId = localStorage.getItem(ACCOUNT_ID_KEY);

  var container = document.getElementById('task-staff-list');
  if (!result.success) {
    container.innerHTML = '<p style="font-size:12px;color:#b91c1c">' + result.message + '</p>';
    return;
  }
  container.innerHTML = '';
  result.staff
    .filter(function (s) { return s.active; })
    // ซ่อน Admin จากตัวเลือกมอบหมายงาน ยกเว้นถูกมอบหมายไว้อยู่แล้ว (กันแก้ไขแล้วหลุดออกไปโดยไม่ตั้งใจ)
    .filter(function (s) { return s.role !== 'admin' || selectedIds.indexOf(s.staffId) !== -1; })
    .forEach(function (s) {
      var isSelf = myRole === 'staff' && s.staffId === myAccountId;
      var checked = isSelf || selectedIds.indexOf(s.staffId) !== -1;
      var label = document.createElement('label');
      label.innerHTML =
        '<input type="checkbox" value="' + s.staffId + '"' +
          (checked ? ' checked' : '') + (isSelf ? ' disabled' : '') + '>' +
        '<span class="dot" style="background:' + s.colorHex + '"></span>' +
        s.firstName + ' ' + s.lastName + (isSelf ? ' (คุณ)' : '');
        container.appendChild(label);
      });
}

// ===== จัดการแผนที่: เตรียมพร้อมสำหรับอนาคต ถ้ายังไม่มี API key จะไม่ทำอะไรเลย (เงียบ ไม่มีข้อความโชว์) =====
function setupTaskMap() {
  if (!GOOGLE_MAPS_API_KEY) return;

  document.getElementById('task-map').style.display = 'block';
  loadGoogleMapsScript(initTaskMap);
}

function loadGoogleMapsScript(callback) {
  if (mapsLoaded) {
    callback();
    return;
  }
  window.__onGoogleMapsLoaded = function () {
    mapsLoaded = true;
    callback();
  };
  var script = document.createElement('script');
  script.src = 'https://maps.googleapis.com/maps/api/js?key=' + GOOGLE_MAPS_API_KEY +
    '&libraries=places&callback=__onGoogleMapsLoaded';
  document.head.appendChild(script);
}

function initTaskMap() {
  var center = { lat: 13.7563, lng: 100.5018 };
  taskMap = new google.maps.Map(document.getElementById('task-map'), {
    center: center, zoom: 12
  });

  var locationInput = document.getElementById('task-location');
  var autocomplete = new google.maps.places.Autocomplete(locationInput);
  autocomplete.bindTo('bounds', taskMap);

  autocomplete.addListener('place_changed', function () {
    var place = autocomplete.getPlace();
    if (!place.geometry) return;
    placeMarker(place.geometry.location);
    taskMap.setCenter(place.geometry.location);
    taskMap.setZoom(16);
  });

  taskMap.addListener('click', function (e) {
    placeMarker(e.latLng);
    var geocoder = new google.maps.Geocoder();
    geocoder.geocode({ location: e.latLng }, function (results, status) {
      if (status === 'OK' && results[0]) {
        locationInput.value = results[0].formatted_address;
      }
    });
  });
}

function placeMarker(latLng) {
  if (taskMarker) taskMarker.setMap(null);
  taskMarker = new google.maps.Marker({ position: latLng, map: taskMap });
}

function submitAddTask() {
  var taskName = document.getElementById('task-name').value.trim();
  var isUndated = document.getElementById('task-undated').checked;
  var isAllDay = document.getElementById('task-allday').checked;
  var btn = document.getElementById('task-submit-btn');

  if (!taskName) {
    Swal.fire({ icon: 'warning', title: 'กรอกข้อมูลไม่ครบ', text: 'กรุณากรอกชื่องาน' });
    return;
  }

  var startDateTime = '', endDateTime = '';

  if (!isUndated) {
    if (isAllDay) {
      var startDate = document.getElementById('task-start-date').value;
      var duration = parseInt(document.getElementById('task-duration').value, 10) || 1;
      if (!startDate) {
        Swal.fire({ icon: 'warning', title: 'กรอกข้อมูลไม่ครบ', text: 'กรุณาเลือกวันเริ่มงาน' });
        return;
      }
      var start = new Date(startDate);
      var end = new Date(start);
      end.setDate(end.getDate() + duration - 1);
      startDateTime = start.toISOString();
      endDateTime = end.toISOString();
    } else {
      var sDate = document.getElementById('task-start-date-t').value;
      var sTime = document.getElementById('task-start-time').value;
      var eDate = document.getElementById('task-end-date-t').value;
      var eTime = document.getElementById('task-end-time').value;
      if (!sDate || !eDate) {
        Swal.fire({ icon: 'warning', title: 'กรอกข้อมูลไม่ครบ', text: 'กรุณาเลือกวันและเวลาให้ครบ' });
        return;
      }
      startDateTime = new Date(sDate + 'T' + sTime).toISOString();
      endDateTime = new Date(eDate + 'T' + eTime).toISOString();
    }
  }

  var staffIds = Array.prototype.slice.call(
    document.querySelectorAll('#task-staff-list input[type="checkbox"]:checked')
  ).map(function (el) { return el.value; });

  var locationName = document.getElementById('task-location').value.trim();
  var lat = taskMarker ? taskMarker.getPosition().lat() : '';
  var lng = taskMarker ? taskMarker.getPosition().lng() : '';
  var detail = document.getElementById('task-detail').value.trim();
  var token = localStorage.getItem(TOKEN_KEY);

  var payload = {
    token: token, taskName: taskName, taskType: document.getElementById('task-type').value,
    isUndated: isUndated, startDateTime: startDateTime, endDateTime: endDateTime,
    isAllDay: isAllDay, staffIds: staffIds, locationName: locationName, lat: lat, lng: lng, detail: detail
  };

  if (!isUndated) {
    var overlaps = getOverlappingHolidays(startDateTime, endDateTime);
    if (overlaps.length > 0) {
      var names = overlaps.map(function (h) { return h.name; }).join(', ');
      Swal.fire({
        icon: 'warning', title: 'งานนี้ทับวันหยุด',
        text: 'ช่วงวันที่เลือกทับกับวันหยุด: ' + names + ' ต้องการสร้าง/บันทึกงานต่อไปหรือไม่?',
        showCancelButton: true, confirmButtonText: 'ดำเนินการต่อ', cancelButtonText: 'ยกเลิก'
      }).then(function (res) {
        if (res.isConfirmed) proceedSaveTask(payload, btn);
      });
      return;
    }
  }
  proceedSaveTask(payload, btn);
}

function proceedSaveTask(payload, btn) {
  var action = editingTaskId ? 'updateTask' : 'addTask';
  if (editingTaskId) payload.taskId = editingTaskId;

  setButtonLoading(btn, true, editingTaskId ? 'กำลังบันทึก...' : 'กำลังบันทึก...');
  callApi(action, payload).then(function (result) {
    if (result.success) {
      closeTaskModal();
      var token = localStorage.getItem(TOKEN_KEY);
      loadAdminEvents(token);
      if (localStorage.getItem(ROLE_KEY) === 'admin') loadTodoList();
      Toast.fire({ icon: 'success', title: editingTaskId ? 'บันทึกการแก้ไขแล้ว' : 'สร้างงานใหม่แล้ว' });
    } else {
      Swal.fire({ icon: 'error', title: 'ไม่สำเร็จ', text: result.message });
    }
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
  }).finally(function () {
    setButtonLoading(btn, false);
  });
}

var TASK_TYPE_LABELS = {
  meeting: 'ประชุม (Meeting)',
  onsite: 'นอกสถานที่ (On-site)',
  event: 'กิจกรรม (Event)',
  leave: 'ลา (Leave)'
};

// ===== To-Do List - โชว์ให้ทุกคนเห็น แก้ไข/ลบได้เฉพาะ Admin - แสดงใน sidebar ขวา ใต้ "วันหยุดเดือนนี้" =====
function loadTodoList() {
  var container = document.getElementById('todo-list-sidebar');
  var isAdmin = localStorage.getItem(ROLE_KEY) === 'admin';
  container.innerHTML = '<p style="font-size:12px;color:#9aa1a8">กำลังโหลด...</p>';

  callApi('getUndatedTasks', {}).then(function (result) {
    if (!result.success) {
      container.innerHTML = '<p style="font-size:12px;color:#b91c1c">' + result.message + '</p>';
      return;
    }
    if (result.tasks.length === 0) {
      container.innerHTML = '<p style="font-size:12px;color:#9aa1a8">ยังไม่มีงานในลิสต์</p>';
      return;
    }
    container.innerHTML = '';
    result.tasks.forEach(function (t) {
      var staffNames = t.staff.map(function (s) { return s.name; }).join(', ');
      var item = document.createElement('div');
      item.className = 'todo-item';
      item.innerHTML =
        '<div class="ti-top">' +
          '<span style="width:8px;height:8px;border-radius:50%;background:' + (TASK_TYPE_COLORS[t.taskType] || '#ccc') + ';display:inline-block;flex-shrink:0"></span>' +
          '<span class="ti-name">' + t.taskName + '</span>' +
        '</div>' +
        (staffNames ? '<p class="ti-staff">ผู้ปฏิบัติงาน: ' + staffNames + '</p>' : '') +
        (isAdmin ?
          '<div class="ti-actions">' +
            '<button class="btn-outline" onclick="editTodoTask(\'' + t.taskId + '\')">แก้ไข/กำหนดวัน</button>' +
            '<button class="btn-reject" onclick="deleteTodoTask(this, \'' + t.taskId + '\')">ลบ</button>' +
          '</div>' : '');
      container.appendChild(item);
    });
  });
}

function editTodoTask(taskId) {
  openTaskModalForEdit(taskId);
}

function deleteTodoTask(btn, taskId) {
  Swal.fire({
    icon: 'warning', title: 'ยืนยันลบงานนี้จาก To-Do List?',
    showCancelButton: true, confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก'
  }).then(function (res) {
    if (!res.isConfirmed) return;
    var token = localStorage.getItem(TOKEN_KEY);
    setButtonLoading(btn, true, 'กำลังลบ...');
    callApi('deleteTask', { token: token, taskId: taskId }).then(function (result) {
      if (result.success) {
        loadTodoList();
        Toast.fire({ icon: 'success', title: 'ลบแล้ว' });
      } else {
        Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: result.message });
      }
    }).catch(function (err) {
      Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
    }).finally(function () {
      setButtonLoading(btn, false);
    });
  });
}

function deleteTaskConfirm(taskId) {
  Swal.fire({
    icon: 'warning', title: 'ยืนยันลบงานนี้?',
    text: 'งานจะถูกซ่อนจากปฏิทิน แต่ข้อมูลยังเก็บไว้ดูย้อนหลังได้',
    showCancelButton: true, confirmButtonText: 'ลบงาน', cancelButtonText: 'ยกเลิก'
  }).then(function (res) {
    if (!res.isConfirmed) return;
    var token = localStorage.getItem(TOKEN_KEY);
    Toast.fire({ icon: 'info', title: 'กำลังลบ...' });
    callApi('deleteTask', { token: token, taskId: taskId }).then(function (result) {
      if (result.success) {
        loadAdminEvents(token);
        Toast.fire({ icon: 'success', title: 'ลบงานแล้ว' });
      } else {
        Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: result.message });
      }
    }).catch(function (err) {
      Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
    });
  });
}

var PROFILE_COLOR_PALETTE = [
  '#EF4444', '#F97316', '#F59E0B', '#84CC16', '#22C55E',
  '#14B8A6', '#0EA5E9', '#6366F1', '#A855F7', '#EC4899'
];

function renderColorSwatches(selectedColor, avatarEl) {
  var container = document.getElementById('profile-color-swatches');
  container.innerHTML = '';

  PROFILE_COLOR_PALETTE.forEach(function (color) {
    var swatch = document.createElement('div');
    swatch.className = 'color-swatch' + (color.toLowerCase() === (selectedColor || '').toLowerCase() ? ' selected' : '');
    swatch.style.background = color;
    swatch.onclick = function () {
      document.getElementById('profile-color').value = color;
      avatarEl.style.background = color;
      container.querySelectorAll('.color-swatch').forEach(function (el) { el.classList.remove('selected'); });
      swatch.classList.add('selected');
    };
    container.appendChild(swatch);
  });
}

function openProfileModal() {
  document.getElementById('profile-modal-overlay').style.display = 'flex';
  document.getElementById('profile-edit-section').style.display = 'none';
  document.getElementById('profile-password-section').style.display = 'none';
  document.getElementById('profile-edit-toggle-btn').textContent = 'แก้ไขข้อมูล';

  var token = localStorage.getItem(TOKEN_KEY);
  callApi('getMyProfile', { token: token }).then(function (result) {
    if (!result.success) {
      Swal.fire({ icon: 'error', title: 'โหลดโปรไฟล์ไม่สำเร็จ', text: result.message });
      return;
    }
    var p = result.profile;
    var avatar = document.getElementById('profile-avatar');
    var photoEl = document.getElementById('profile-photo');

    if (p.photoURL) {
      photoEl.src = p.photoURL;
      photoEl.style.display = 'block';
      avatar.style.display = 'none';
    } else {
      photoEl.style.display = 'none';
      avatar.style.display = 'flex';
      avatar.textContent = (p.firstName || '?').charAt(0);
      avatar.style.background = p.colorHex || '#378ADD';
    }

    document.getElementById('profile-fullname').textContent = p.firstName + ' ' + p.lastName;
    document.getElementById('profile-position').textContent = p.position || 'ไม่ระบุตำแหน่ง';
    document.getElementById('profile-username').textContent = '@' + p.username;
    document.getElementById('profile-gender').textContent = p.gender || '-';
    document.getElementById('profile-age').textContent = p.age !== null ? p.age + ' ปี' : '-';
    document.getElementById('profile-birthdate').textContent = p.birthDate || '-';

    document.getElementById('profile-phone').value = p.phone || '';
    document.getElementById('profile-color').value = p.colorHex || '#EF4444';
    renderColorSwatches(p.colorHex || '#EF4444', avatar);
  });
}

function toggleProfileEdit() {
  var section = document.getElementById('profile-edit-section');
  var isHidden = section.style.display === 'none';
  section.style.display = isHidden ? 'block' : 'none';
  document.getElementById('profile-edit-toggle-btn').textContent = isHidden ? 'ปิดแก้ไขข้อมูล' : 'แก้ไขข้อมูล';
}

function toggleProfilePassword() {
  var section = document.getElementById('profile-password-section');
  section.style.display = section.style.display === 'none' ? 'block' : 'none';
}

function closeProfileModal() {
  document.getElementById('profile-modal-overlay').style.display = 'none';
  document.getElementById('profile-old-password').value = '';
  document.getElementById('profile-new-password').value = '';
  document.getElementById('profile-confirm-password').value = '';
  document.getElementById('profile-photo-input').value = '';
}

document.getElementById('profile-photo-input').addEventListener('change', function (e) {
  var file = e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    Swal.fire({ icon: 'warning', title: 'ไฟล์ไม่ถูกต้อง', text: 'กรุณาเลือกไฟล์รูปภาพ' });
    return;
  }

  // ย่อขนาด+บีบอัดรูปผ่าน canvas ก่อนแปลงเป็น base64 เสมอ
  // (ไฟล์รูปจากมือถือมักมีความละเอียดสูงมาก ถ้าส่งดิบๆ payload จะใหญ่เกินไปจนเชื่อมต่อ API ไม่ได้)
  var img = new Image();
  var objectUrl = URL.createObjectURL(file);

  img.onload = function () {
    var MAX_SIZE = 300;
    var w = img.width, h = img.height;
    if (w > h && w > MAX_SIZE) { h = Math.round(h * (MAX_SIZE / w)); w = MAX_SIZE; }
    else if (h > MAX_SIZE) { w = Math.round(w * (MAX_SIZE / h)); h = MAX_SIZE; }

    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(objectUrl);

    var btn = document.getElementById('profile-change-photo-btn');
    setButtonLoading(btn, true, 'กำลังอัปโหลด...');
    var token = localStorage.getItem(TOKEN_KEY);
    var myAccountId = localStorage.getItem(ACCOUNT_ID_KEY);

    canvas.toBlob(function (blob) {
      // อัปโหลดตรงไป Firebase Storage ก่อน (ไม่ผ่าน Cloud Function เพราะไม่ใช่ข้อมูลที่ต้อง validate อะไรซับซ้อน)
      var storageRef = fbStorage.ref('profile-photos/' + myAccountId);
      storageRef.put(blob, { contentType: 'image/jpeg' }).then(function () {
        return storageRef.getDownloadURL();
      }).then(function (url) {
        // ได้ URL แล้ว เอาไปบันทึกลง Firestore ผ่าน Cloud Function ตามปกติ
        return callApi('updateOwnProfile', { token: token, photoURL: url }).then(function (result) {
          if (result.success) {
            document.getElementById('profile-photo').src = url;
            document.getElementById('profile-photo').style.display = 'block';
            document.getElementById('profile-avatar').style.display = 'none';
            Toast.fire({ icon: 'success', title: 'เปลี่ยนรูปโปรไฟล์แล้ว' });
          } else {
            Swal.fire({ icon: 'error', title: 'ไม่สำเร็จ', text: result.message });
          }
        });
      }).catch(function (err) {
        Swal.fire({ icon: 'error', title: 'อัปโหลดรูปไม่สำเร็จ', text: err.message });
      }).finally(function () {
        setButtonLoading(btn, false);
      });
    }, 'image/jpeg', 0.75);
  };

  img.onerror = function () {
    URL.revokeObjectURL(objectUrl);
    Swal.fire({ icon: 'error', title: 'เปิดไฟล์รูปไม่ได้', text: 'กรุณาลองเลือกไฟล์อื่น' });
  };

  img.src = objectUrl;
});

function submitUpdateProfile() {
  var phone = document.getElementById('profile-phone').value.trim();
  var colorHex = document.getElementById('profile-color').value;
  var btn = document.getElementById('profile-save-btn');
  var token = localStorage.getItem(TOKEN_KEY);

  setButtonLoading(btn, true, 'กำลังบันทึก...');
  callApi('updateOwnProfile', { token: token, phone: phone, colorHex: colorHex }).then(function (result) {
    if (result.success) {
      Toast.fire({ icon: 'success', title: 'บันทึกข้อมูลแล้ว' });
      loadMemberSidebar();
      var currentToken = localStorage.getItem(TOKEN_KEY);
      if (currentToken) { loadAdminEvents(currentToken); } else { loadPublicEvents(); }
    } else {
      Swal.fire({ icon: 'error', title: 'ไม่สำเร็จ', text: result.message });
    }
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
  }).finally(function () {
    setButtonLoading(btn, false);
  });
}

function submitChangePassword() {
  var oldPassword = document.getElementById('profile-old-password').value;
  var newPassword = document.getElementById('profile-new-password').value;
  var confirmPassword = document.getElementById('profile-confirm-password').value;
  var btn = document.getElementById('profile-password-btn');

  if (!oldPassword || !newPassword || !confirmPassword) {
    Swal.fire({ icon: 'warning', title: 'กรอกข้อมูลไม่ครบ', text: 'กรุณากรอกรหัสผ่านให้ครบทุกช่อง' });
    return;
  }
  if (newPassword !== confirmPassword) {
    Swal.fire({ icon: 'warning', title: 'รหัสผ่านไม่ตรงกัน', text: 'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน' });
    return;
  }

  var token = localStorage.getItem(TOKEN_KEY);
  setButtonLoading(btn, true, 'กำลังเปลี่ยน...');
  callApi('changeOwnPassword', { token: token, oldPassword: oldPassword, newPassword: newPassword }).then(function (result) {
    if (result.success) {
      document.getElementById('profile-old-password').value = '';
      document.getElementById('profile-new-password').value = '';
      document.getElementById('profile-confirm-password').value = '';
      Toast.fire({ icon: 'success', title: 'เปลี่ยนรหัสผ่านแล้ว' });
    } else {
      Swal.fire({ icon: 'error', title: 'ไม่สำเร็จ', text: result.message });
    }
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
  }).finally(function () {
    setButtonLoading(btn, false);
  });
}

function openHolidayModal() {
  document.getElementById('holiday-modal-overlay').style.display = 'flex';
  renderHolidayList();
}
function closeHolidayModal() {
  document.getElementById('holiday-modal-overlay').style.display = 'none';
}

function toggleHolidayTypeFields() {
  var isWeekly = document.getElementById('holiday-type').value === 'weekly';
  document.getElementById('holiday-date-field').style.display = isWeekly ? 'none' : 'block';
  document.getElementById('holiday-weekly-field').style.display = isWeekly ? 'block' : 'none';
}

function renderHolidayList() {
  var container = document.getElementById('holiday-list');
  container.innerHTML = '';
  if (holidaysCache.length === 0) {
    container.innerHTML = '<p style="font-size:13px;color:#6b7280">ยังไม่มีวันหยุดที่ตั้งไว้</p>';
    return;
  }

  var weekly = holidaysCache.filter(function (h) { return h.type === 'weekly'; });
  var dated = holidaysCache.filter(function (h) { return h.type === 'date'; })
    .slice().sort(function (a, b) { return a.value < b.value ? -1 : 1; });

  weekly.concat(dated).forEach(function (h) {
    var row = document.createElement('div');
    row.className = 'holiday-row';
    var badge = h.type === 'weekly'
      ? '<span class="holiday-badge weekly">ทุกสัปดาห์</span>'
      : '<span class="holiday-badge">' + h.value + '</span>';
    var label = h.type === 'weekly' ? ('ทุกวัน' + WEEKDAY_NAMES[h.value]) : h.name;
    row.innerHTML =
      badge +
      '<span class="hname">' + h.name + (h.type === 'weekly' ? ' (' + WEEKDAY_NAMES[h.value] + ')' : '') + '</span>' +
      '<button class="row-edit-btn" onclick="deleteHolidayConfirm(this, \'' + h.holidayId + '\')">ลบ</button>';
    container.appendChild(row);
  });
}

function submitAddHoliday() {
  var type = document.getElementById('holiday-type').value;
  var value = type === 'weekly'
    ? document.getElementById('holiday-weekday').value
    : document.getElementById('holiday-date').value;
  var name = document.getElementById('holiday-name').value.trim();
  var btn = document.getElementById('holiday-submit-btn');

  if (!value || !name) {
    Swal.fire({ icon: 'warning', title: 'กรอกข้อมูลไม่ครบ', text: 'กรุณาเลือกวัน/วันที่ และกรอกชื่อวันหยุด' });
    return;
  }

  var token = localStorage.getItem(TOKEN_KEY);
  setButtonLoading(btn, true, 'กำลังเพิ่ม...');
  callApi('addHoliday', { token: token, type: type, value: value, name: name }).then(function (result) {
    if (result.success) {
      document.getElementById('holiday-date').value = '';
      document.getElementById('holiday-name').value = '';
      refreshCalendarAfterHolidayChange();
      renderHolidayList();
      Toast.fire({ icon: 'success', title: 'เพิ่มวันหยุดแล้ว' });
    } else {
      Swal.fire({ icon: 'error', title: 'เพิ่มไม่สำเร็จ', text: result.message });
    }
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
  }).finally(function () {
    setButtonLoading(btn, false);
  });
}

function deleteHolidayConfirm(btn, holidayId) {
  Swal.fire({
    icon: 'warning', title: 'ยืนยันลบวันหยุดนี้?',
    showCancelButton: true, confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก'
  }).then(function (res) {
    if (!res.isConfirmed) return;
    var token = localStorage.getItem(TOKEN_KEY);
    setButtonLoading(btn, true, 'กำลังลบ...');
    callApi('deleteHoliday', { token: token, holidayId: holidayId }).then(function (result) {
      if (result.success) {
        refreshCalendarAfterHolidayChange();
        renderHolidayList();
        Toast.fire({ icon: 'success', title: 'ลบวันหยุดแล้ว' });
      } else {
        Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: result.message });
      }
    }).catch(function (err) {
      Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
    }).finally(function () {
      setButtonLoading(btn, false);
    });
  });
}

// เก็บชื่อฟังก์ชันไว้ให้จุดเรียกใช้เดิมยังทำงานได้ แต่ไม่ต้องทำอะไรจริงแล้ว
// เพราะ setupHolidaysRealtimeListener() destroy+สร้างปฏิทินใหม่ให้อัตโนมัติอยู่แล้วทุกครั้งที่ addHoliday/deleteHoliday เปลี่ยนข้อมูลจริง
function refreshCalendarAfterHolidayChange() {
  // no-op: real-time listener จัดการให้แล้ว
}

// คำนวณความสว่างของสีพื้นหลัง แล้วเลือกสีตัวอักษร (ขาว/เข้ม) ให้อ่านง่ายเสมอไม่ว่าพื้นหลังจะเป็นสีอะไร
function getContrastTextColor(hex) {
  hex = (hex || '#888888').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
  var r = parseInt(hex.substr(0, 2), 16) / 255;
  var g = parseInt(hex.substr(2, 2), 16) / 255;
  var b = parseInt(hex.substr(4, 2), 16) / 255;
  var luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.55 ? '#1f2430' : '#ffffff';
}

// ===== แปลงสี hex เป็น rgba แบบจาง (ใช้ทำพื้นหลังจางเต็มแถวในโหมด List) =====
function hexToRgba(hex, alpha) {
  hex = (hex || '#888888').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
  var r = parseInt(hex.substr(0, 2), 16);
  var g = parseInt(hex.substr(2, 2), 16);
  var b = parseInt(hex.substr(4, 2), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

function loadMemberSidebar() {
  var cached = getLocalCache(STAFF_CACHE_KEY);
  if (cached) renderMemberList(cached);

  callApi('getPublicStaffList', {}).then(function (result) {
    if (!result.success) {
      if (!cached) {
        document.getElementById('member-list').innerHTML =
          '<p style="font-size:12px;color:#b91c1c">โหลดไม่สำเร็จ: ' + (result.message || 'ไม่รู้จัก action นี้') + '</p>';
      }
      return;
    }
    setLocalCache(STAFF_CACHE_KEY, result.staff);
    renderMemberList(result.staff);
  }).catch(function (err) {
    console.error('โหลดรายชื่อผู้ปฏิบัติงานไม่สำเร็จ', err);
  });
}

function renderMemberList(staff) {
  // อัปเดต staffMapCache ไว้ใช้จับคู่ชื่อ+สีตอนสร้าง event ปฏิทินจาก staffIds (แทนที่ server เคย join ให้ตอนอยู่บน Apps Script)
  staff.forEach(function (s) {
    if (s.staffId) staffMapCache[s.staffId] = s;
  });
  refreshCalendarDayCells(); // ชื่อผู้ปฏิบัติงานอาจเพิ่ง resolve ได้ใหม่ (เช่น เพิ่งโหลดเสร็จ) ต้องรีเฟรช event ให้ตรง

  var container = document.getElementById('member-list');
  if (staff.length === 0) {
    container.innerHTML = '<p style="font-size:12px;color:#9aa1a8">ยังไม่มีผู้ปฏิบัติงาน</p>';
    return;
  }
  container.innerHTML = '';
  staff.forEach(function (s) {
    var color = s.colorHex || '#888780';
    var textColor = getContrastTextColor(color);
    var initial = (s.firstName || '?').charAt(0);

    var card = document.createElement('div');
    card.className = 'member-card';
    card.style.background = color;
    card.innerHTML =
      '<div class="member-avatar-wrap">' +
        (s.photoURL
          ? '<img src="' + s.photoURL + '" alt="">'
          : '<span class="member-avatar-fallback" style="color:' + color + '">' + initial + '</span>') +
      '</div>' +
      '<div class="member-info">' +
        '<p class="m-name" style="color:' + textColor + '">' + s.firstName + ' ' + s.lastName + '</p>' +
        '<p class="m-pos" style="color:' + textColor + '">' + (s.position || '-') + '</p>' +
      '</div>';
    container.appendChild(card);
  });
}

function isMobileView() {
  return window.innerWidth <= 768;
}

// Tablet (769-1024px) ใช้ drawer เหมือนมือถือด้วย แต่ปฏิทิน/topbar ยังเหมือน PC
function isDrawerView() {
  return window.innerWidth <= 1024;
}

function toggleSidebar(panelId) {
  var panel = document.getElementById(panelId);

  if (isDrawerView()) {
    var isOpening = !panel.classList.contains('drawer-open');
    closeAllDrawers();
    if (isOpening) {
      panel.classList.add('drawer-open');
      document.getElementById('drawer-backdrop').classList.add('show');
    }
    return;
  }

  var btnId = panelId === 'member-sidebar' ? 'toggle-members-btn' : 'toggle-legend-btn';
  var btn = document.getElementById(btnId);
  panel.classList.toggle('collapsed');
  btn.classList.toggle('active', !panel.classList.contains('collapsed'));
}

function closeAllDrawers() {
  document.getElementById('member-sidebar').classList.remove('drawer-open');
  document.getElementById('legend-sidebar').classList.remove('drawer-open');
  document.getElementById('drawer-backdrop').classList.remove('show');
}

// ===== เมนูลอยมือถือ (แท่งลอยเต็มความกว้าง) =====
function fabAction(action) {
  if (action === 'toggleView') {
    toggleCalendarViewMode();
  } else if (action === 'team') {
    toggleSidebar('member-sidebar');
  } else if (action === 'addtask') {
    closeAllDrawers();
    if (localStorage.getItem(TOKEN_KEY)) { openTaskModal(); } else { openLoginModal(); }
  } else if (action === 'legend') {
    toggleSidebar('legend-sidebar');
  } else if (action === 'menu') {
    openMoreMenu();
  }
}

// ===== สลับมุมมองปฏิทิน Grid เดือน <-> List (สำหรับมือถือ/Tablet) จำค่าที่เลือกไว้ใน localStorage =====
var CALENDAR_VIEW_PREF_KEY = 'c2tech_calendar_view_pref';

// ===== Export งานในเดือนที่กำลังดูอยู่เป็นไฟล์ Excel (ใช้ข้อมูลที่โหลดไว้แล้ว ไม่ต้องยิง API ใหม่) =====
function exportMonthToExcel() {
  if (!calendarInstance || !lastTaskDocs.length) {
    Swal.fire({ icon: 'info', title: 'ยังไม่มีข้อมูลงานให้ export' });
    return;
  }

  var rangeStart = calendarInstance.view.currentStart;
  var rangeEnd = calendarInstance.view.currentEnd;
  var monthLabel = calendarInstance.view.title;

  var rows = [];
  lastTaskDocs.forEach(function (docSnap) {
    var row = docSnap.data();
    if (row.isUndated || !row.startDateTime) return;
    var start = firestoreDateToJs(row.startDateTime);
    if (start < rangeStart || start >= rangeEnd) return; // เอาแค่งานในเดือนที่กำลังดูอยู่

    var end = firestoreDateToJs(row.endDateTime) || start;
    var staffNames = (row.staffIds || []).map(function (id) {
      var s = staffMapCache[id];
      return s ? s.firstName + ' ' + s.lastName : '';
    }).filter(function (n) { return n; }).join(', ');

    rows.push({
      'วันที่เริ่ม': start.toLocaleDateString('th-TH'),
      'วันที่สิ้นสุด': end.toLocaleDateString('th-TH'),
      'ชื่องาน': row.taskName,
      'ประเภทงาน': (TASK_TYPE_LABELS[row.taskType] || row.taskType),
      'ผู้ปฏิบัติงาน': staffNames,
      'สถานที่': row.locationName || '',
      'สถานะ': row.status,
      'รายละเอียด': row.detail || ''
    });
  });

  if (rows.length === 0) {
    Swal.fire({ icon: 'info', title: 'ไม่มีงานในเดือนนี้ให้ export' });
    return;
  }

  var ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 14 }, { wch: 25 }, { wch: 20 }, { wch: 16 }, { wch: 30 }];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'งาน');
  XLSX.writeFile(wb, 'C2Calendar_' + monthLabel.replace(/\s/g, '_') + '.xlsx');
  Toast.fire({ icon: 'success', title: 'Export สำเร็จ (' + rows.length + ' งาน)' });
}

function toggleCalendarViewMode() {
  if (!calendarInstance) return;
  var newView = calendarInstance.view.type === 'listMonth' ? 'dayGridMonth' : 'listMonth';
  calendarInstance.changeView(newView);
  localStorage.setItem(CALENDAR_VIEW_PREF_KEY, newView);
  updateViewToggleLabel(newView);
}

function updateViewToggleLabel(viewType) {
  var label = document.getElementById('mfn-view-toggle-label');
  if (!label) return;
  label.textContent = viewType === 'listMonth' ? 'ดูเดือน' : 'ดูรายการ';
}

// ===== Dashboard สรุปงาน (Admin/CEO) =====
var dashboardChartDaily = null;
var dashboardChartType = null;

function onDashboardPeriodChange() {
  var isCustom = document.getElementById('dashboard-period').value === 'custom';
  document.getElementById('dashboard-custom-range').style.display = isCustom ? 'inline-flex' : 'none';
  if (!isCustom) loadDashboardData();
}

function openDashboardModal() {
  document.getElementById('dashboard-modal-overlay').style.display = 'flex';
  loadDashboardData();
}

function closeDashboardModal() {
  document.getElementById('dashboard-modal-overlay').style.display = 'none';
}

// คำนวณช่วงวันที่ของงวดปัจจุบันและงวดก่อนหน้า (สำหรับเทียบเทรนด์) จาก period ที่เลือก
function getDashboardRanges(period) {
  var now = new Date();
  var curStart, curEnd, prevStart, prevEnd, label;

  if (period === 'custom') {
    var startVal = document.getElementById('dashboard-custom-start').value;
    var endVal = document.getElementById('dashboard-custom-end').value;
    if (!startVal || !endVal) {
      // ยังไม่ได้เลือกวันที่ครบ ใช้เดือนนี้ไปพลางๆก่อน
      curStart = new Date(now.getFullYear(), now.getMonth(), 1);
      curEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    } else {
      curStart = new Date(startVal + 'T00:00:00');
      curEnd = new Date(endVal + 'T00:00:00');
      curEnd.setDate(curEnd.getDate() + 1); // รวมวันสิ้นสุดด้วย (exclusive end)
    }
    // ช่วงกำหนดเองไม่มีงวดก่อนหน้าให้เทียบ (ความยาวช่วงไม่แน่นอน) ใช้ช่วงเดียวกันไปเปรียบเทียบกับตัวเอง = ไม่มีเทรนด์
    prevStart = curStart; prevEnd = curStart;
    label = curStart.toLocaleDateString('th-TH') + ' - ' + new Date(curEnd - 86400000).toLocaleDateString('th-TH');
    return { curStart: curStart, curEnd: curEnd, prevStart: prevStart, prevEnd: prevEnd, label: label };
  }

  if (period === 'week') {
    var day = now.getDay(); // 0=อาทิตย์
    curStart = new Date(now); curStart.setDate(now.getDate() - day); curStart.setHours(0, 0, 0, 0);
    curEnd = new Date(curStart); curEnd.setDate(curStart.getDate() + 7);
    prevStart = new Date(curStart); prevStart.setDate(curStart.getDate() - 7);
    prevEnd = new Date(curStart);
    label = 'สัปดาห์นี้ (' + curStart.toLocaleDateString('th-TH') + ' - ' +
      new Date(curEnd - 86400000).toLocaleDateString('th-TH') + ')';
  } else {
    curStart = new Date(now.getFullYear(), now.getMonth(), 1);
    curEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    prevEnd = curStart;
    label = curStart.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  }
  return { curStart: curStart, curEnd: curEnd, prevStart: prevStart, prevEnd: prevEnd, label: label };
}

// กรองงานจาก lastTaskDocs ที่โหลดไว้แล้ว (ไม่ยิง API ใหม่) ตามช่วงวันที่ที่กำหนด
function filterTasksByRange(start, end) {
  var result = [];
  lastTaskDocs.forEach(function (docSnap) {
    var row = docSnap.data();
    if (row.isUndated || !row.startDateTime || row.status === 'ยกเลิกงาน') return;
    var taskStart = firestoreDateToJs(row.startDateTime);
    if (taskStart >= start && taskStart < end) result.push({ id: docSnap.id, data: row, start: taskStart });
  });
  return result;
}

function trendBadge(cur, prev) {
  if (prev === 0) return cur > 0 ? '<span class="trend-up">ใหม่</span>' : '';
  var diff = cur - prev;
  var pct = Math.round((diff / prev) * 100);
  if (diff === 0) return '<span class="trend-flat">±0%</span>';
  return diff > 0
    ? '<span class="trend-up">▲ ' + pct + '%</span>'
    : '<span class="trend-down">▼ ' + Math.abs(pct) + '%</span>';
}

function loadDashboardData() {
  var period = document.getElementById('dashboard-period').value;
  var ranges = getDashboardRanges(period);
  var curTasks = filterTasksByRange(ranges.curStart, ranges.curEnd);
  var prevTasks = filterTasksByRange(ranges.prevStart, ranges.prevEnd);
  var showTrend = period !== 'custom'; // ช่วงกำหนดเองไม่มีงวดก่อนหน้าให้เทียบจริง ไม่โชว์เทรนด์กันหลอกตา

  // ===== การ์ดสรุป (พร้อมเทรนด์เทียบงวดก่อน) =====
  var typeKeys = ['meeting', 'onsite', 'event', 'leave'];
  var curByType = {}, prevByType = {};
  typeKeys.forEach(function (t) { curByType[t] = 0; prevByType[t] = 0; });
  curTasks.forEach(function (t) { curByType[t.data.taskType] = (curByType[t.data.taskType] || 0) + 1; });
  prevTasks.forEach(function (t) { prevByType[t.data.taskType] = (prevByType[t.data.taskType] || 0) + 1; });

  var cardsHtml = '<div class="dash-card"><p class="dash-num">' + curTasks.length + '</p>' +
    '<p class="dash-label">งานทั้งหมด</p>' + (showTrend ? trendBadge(curTasks.length, prevTasks.length) : '') + '</div>';
  typeKeys.forEach(function (t) {
    cardsHtml += '<div class="dash-card"><p class="dash-num">' + curByType[t] + '</p>' +
      '<p class="dash-label">' + (TASK_TYPE_LABELS[t] || t) + '</p>' +
      (showTrend ? trendBadge(curByType[t], prevByType[t]) : '') + '</div>';
  });
  document.getElementById('dashboard-cards').innerHTML = cardsHtml;

  // ===== กราฟแท่ง: จำนวนงานต่อวัน =====
  var dayCount = {};
  curTasks.forEach(function (t) {
    var key = t.start.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
    dayCount[key] = (dayCount[key] || 0) + 1;
  });
  var dayLabels = Object.keys(dayCount);
  if (dashboardChartDaily) dashboardChartDaily.destroy();
  dashboardChartDaily = new Chart(document.getElementById('dashboard-chart-daily'), {
    type: 'bar',
    data: { labels: dayLabels, datasets: [{ label: 'จำนวนงาน', data: dayLabels.map(function (k) { return dayCount[k]; }), backgroundColor: '#059669' }] },
    options: { responsive: true, plugins: { title: { display: true, text: 'จำนวนงานต่อวัน' } } }
  });

  // ===== กราฟวงกลม: สัดส่วนประเภทงาน =====
  if (dashboardChartType) dashboardChartType.destroy();
  dashboardChartType = new Chart(document.getElementById('dashboard-chart-type'), {
    type: 'doughnut',
    data: {
      labels: typeKeys.map(function (t) { return TASK_TYPE_LABELS[t] || t; }),
      datasets: [{ data: typeKeys.map(function (t) { return curByType[t]; }), backgroundColor: typeKeys.map(getTaskTypeColor) }]
    },
    options: { responsive: true, plugins: { title: { display: true, text: 'สัดส่วนประเภทงาน' } } }
  });

  // ===== ตารางภาระงาน (CEO + Staff เท่านั้น ไม่รวม Admin) =====
  var workload = {};
  curTasks.forEach(function (t) {
    (t.data.staffIds || []).forEach(function (id) {
      var s = staffMapCache[id];
      if (!s || s.role === 'admin') return;
      workload[id] = (workload[id] || 0) + 1;
    });
  });
  var sorted = Object.keys(workload).sort(function (a, b) { return workload[b] - workload[a]; });
  var tableHtml = '<table class="dash-workload-table"><tr><th>ชื่อ</th><th>จำนวนงาน</th></tr>';
  if (sorted.length === 0) tableHtml += '<tr><td colspan="2">ไม่มีข้อมูล</td></tr>';
  sorted.forEach(function (id) {
    var s = staffMapCache[id];
    tableHtml += '<tr><td>' + s.firstName + ' ' + s.lastName + '</td><td>' + workload[id] + '</td></tr>';
  });
  tableHtml += '</table>';
  document.getElementById('dashboard-workload-table').innerHTML = tableHtml;

  // เก็บไว้ใช้ตอนพิมพ์รายงาน
  window._dashboardPrintData = { ranges: ranges, curTasks: curTasks, workload: workload, sorted: sorted };
}

// ===== พิมพ์รายงาน (เปิด print dialog ของเบราว์เซอร์ ให้ Save เป็น PDF ได้เอง) =====
// เฉพาะรายงานพิมพ์ - ใช้ภาษาอังกฤษล้วนให้กระชับ (ในแอปใช้ไทย+อังกฤษตามเดิม ไม่เกี่ยวกัน)
var TASK_TYPE_LABELS_EN = { meeting: 'Meeting', onsite: 'On-site', event: 'Event', leave: 'Leave' };

function printDashboardReport() {
  var d = window._dashboardPrintData;
  if (!d) return;

  document.getElementById('print-report-period').textContent = d.ranges.label;

  var summaryHtml = '<p><b>จำนวนงานทั้งหมด:</b> ' + d.curTasks.length + ' งาน</p>';
  document.getElementById('print-report-summary').innerHTML = summaryHtml;

  var rows = '<tr><th>วันที่</th><th>ชื่องาน</th><th>ประเภท</th><th>ผู้ปฏิบัติงาน</th><th>สถานที่</th></tr>';
  d.curTasks.sort(function (a, b) { return a.start - b.start; }).forEach(function (t) {
    var staffNames = (t.data.staffIds || []).map(function (id) {
      var s = staffMapCache[id];
      return s ? s.firstName + ' ' + s.lastName : '';
    }).filter(function (n) { return n; }).join(', ');
    rows += '<tr><td>' + t.start.toLocaleDateString('th-TH') + '</td><td>' + t.data.taskName + '</td>' +
      '<td>' + (TASK_TYPE_LABELS_EN[t.data.taskType] || t.data.taskType) + '</td>' +
      '<td>' + staffNames + '</td><td>' + (t.data.locationName || '-') + '</td></tr>';
  });
  document.getElementById('print-report-table').innerHTML = rows;

  // ตารางภาระงานของแต่ละคน (สไตล์เดียวกับใน Dashboard)
  var workloadRows = '<tr><th>ชื่อ</th><th>จำนวนงาน</th></tr>';
  if (d.sorted.length === 0) {
    workloadRows += '<tr><td colspan="2">ไม่มีข้อมูล</td></tr>';
  } else {
    d.sorted.forEach(function (id) {
      var s = staffMapCache[id];
      workloadRows += '<tr><td>' + s.firstName + ' ' + s.lastName + '</td><td>' + d.workload[id] + '</td></tr>';
    });
  }
  document.getElementById('print-report-workload').innerHTML = workloadRows;

  window.print();
}

function openMoreMenu() {
  closeAllDrawers();
  var role = localStorage.getItem(ROLE_KEY);
  var name = localStorage.getItem(NAME_KEY);
  var container = document.getElementById('more-menu-list');
  var nameEl = document.getElementById('more-menu-name');
  var refreshBtn = '<button onclick="closeMoreMenu(); mobileRefreshFromMenu();">🔄 รีเฟรชข้อมูล</button>';

  if (!localStorage.getItem(TOKEN_KEY)) {
    nameEl.textContent = 'ยังไม่ได้เข้าสู่ระบบ';
    container.innerHTML = refreshBtn + '<button onclick="closeMoreMenu(); openLoginModal();">เข้าสู่ระบบ</button>';
  } else {
    nameEl.textContent = name || '';
    var unreadCount = lastNotifications.filter(function (n) { return !n.read; }).length;
    var badgeText = unreadCount > 0 ? ' 🔴 (' + unreadCount + ')' : '';
    var items = [];
    items.push({ label: 'โปรไฟล์', fn: 'openProfileModal()' });
    items.push({ label: 'การแจ้งเตือน' + badgeText, fn: 'openMyRequestsModal()' });
    if (role === 'admin') {
      items.push({ label: 'บัญชีผู้ใช้', fn: 'openStaffModal()' });
      items.push({ label: 'วันหยุด', fn: 'openHolidayModal()' });
    }
    if (role === 'admin' || role === 'ceo') {
      items.push({ label: 'Dashboard สรุปงาน', fn: 'openDashboardModal()' });
      items.push({ label: 'Export Excel (เดือนที่ดูอยู่)', fn: 'exportMonthToExcel()' });
    }
    container.innerHTML = refreshBtn + items.map(function (it) {
      return '<button onclick="closeMoreMenu(); ' + it.fn + '">' + it.label + '</button>';
    }).join('') + '<button class="danger" onclick="closeMoreMenu(); doLogout();">ออกจากระบบ</button>';
  }

  document.getElementById('more-menu-overlay').classList.add('show');
}

function mobileRefreshFromMenu() {
  Toast.fire({ icon: 'info', title: 'กำลังรีเฟรช...' });
  var token = localStorage.getItem(TOKEN_KEY);
  var role = localStorage.getItem(ROLE_KEY);
  Promise.all([
    loadHolidays(),
    loadMemberSidebar(),
    loadTodoList()
  ]).then(function () {
    if (token) { loadAdminEvents(token); } else { loadPublicEvents(); }
    Toast.fire({ icon: 'success', title: 'รีเฟรชข้อมูลแล้ว' });
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'รีเฟรชไม่สำเร็จ', text: err.message });
  });
}

function closeMoreMenu() {
  document.getElementById('more-menu-overlay').classList.remove('show');
}

// ===== Staff: ขอลบงาน =====
function requestDeleteTaskConfirm(taskId) {
  Swal.fire({
    icon: 'warning', title: 'ส่งคำขอลบงานนี้?',
    input: 'text', inputPlaceholder: 'เหตุผล (ไม่บังคับ)',
    text: 'Admin จะต้องอนุมัติก่อนงานถึงจะถูกลบจริง',
    showCancelButton: true, confirmButtonText: 'ส่งคำขอ', cancelButtonText: 'ยกเลิก'
  }).then(function (res) {
    if (!res.isConfirmed) return;
    var token = localStorage.getItem(TOKEN_KEY);
    Toast.fire({ icon: 'info', title: 'กำลังส่งคำขอ...' });
    callApi('requestDeleteTask', { token: token, taskId: taskId, reason: res.value || '' }).then(function (result) {
      if (result.success) {
        Toast.fire({ icon: 'success', title: 'ส่งคำขอลบงานแล้ว รออนุมัติจาก Admin' });
      } else {
        Swal.fire({ icon: 'error', title: 'ส่งคำขอไม่สำเร็จ', text: result.message });
      }
    }).catch(function (err) {
      Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
    });
  });
}

// ===== Staff: ขอเปลี่ยนวัน =====
var rescheduleTaskId = null;

function openRescheduleModal(taskId) {
  rescheduleTaskId = taskId;
  document.getElementById('reschedule-start-date').value = '';
  document.getElementById('reschedule-end-date').value = '';
  document.getElementById('reschedule-reason').value = '';
  document.getElementById('reschedule-modal-overlay').style.display = 'flex';
}
function closeRescheduleModal() {
  document.getElementById('reschedule-modal-overlay').style.display = 'none';
}

function submitRescheduleRequest() {
  var startDate = document.getElementById('reschedule-start-date').value;
  var endDate = document.getElementById('reschedule-end-date').value;
  var reason = document.getElementById('reschedule-reason').value.trim();
  var btn = document.getElementById('reschedule-submit-btn');

  if (!startDate || !endDate) {
    Swal.fire({ icon: 'warning', title: 'กรอกข้อมูลไม่ครบ', text: 'กรุณาเลือกวันเริ่มและวันสิ้นสุดใหม่' });
    return;
  }

  var token = localStorage.getItem(TOKEN_KEY);
  setButtonLoading(btn, true, 'กำลังส่งคำขอ...');
  callApi('requestRescheduleTask', {
    token: token, taskId: rescheduleTaskId,
    newStartDateTime: new Date(startDate).toISOString(),
    newEndDateTime: new Date(endDate).toISOString(),
    reason: reason
  }).then(function (result) {
    if (result.success) {
      closeRescheduleModal();
      Toast.fire({ icon: 'success', title: 'ส่งคำขอเปลี่ยนวันแล้ว รออนุมัติจาก Admin' });
    } else {
      Swal.fire({ icon: 'error', title: 'ส่งคำขอไม่สำเร็จ', text: result.message });
    }
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
  }).finally(function () {
    setButtonLoading(btn, false);
  });
}

// ===== แจ้งเตือนกระดิ่ง (Admin) =====
var REQUEST_TYPE_LABELS = { delete: 'ขอลบงาน', reschedule: 'ขอเปลี่ยนวัน' };

// ===== เสียงแจ้งเตือน: ลองใช้เสียงพูดก่อน (ไม่ต้องมีไฟล์เสียง) ถ้าเบราว์เซอร์ไม่รองรับใช้เสียง beep แทนอัตโนมัติ =====
// ===== เลือกเสียงพูดภาษาไทยที่มีในเครื่อง พร้อมเดาเพศจากชื่อเสียง =====
// ===== ขออนุญาตแจ้งเตือนระบบ (ครั้งเดียวหลัง login) เพื่อให้เรียก Notification ได้ทีหลัง =====
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// ===== โชว์แจ้งเตือนผ่าน Notification API ของเบราว์เซอร์/ระบบปฏิบัติการ =====
// วิธีนี้ให้ผลเหมือนกันทั้ง PC และมือถือ: ระบบปฏิบัติการเป็นคนเล่น "เสียงแจ้งเตือนมาตรฐาน" ให้เองอัตโนมัติ
// ไม่ต้องมาเลือกเสียงเองอีกต่อไป (เดิมใช้เสียงพูดสังเคราะห์ ซึ่งบางเครื่องไม่มีเสียงไทยที่ฟังดูเป็นธรรมชาติ)
function playNotificationSound(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body: body, icon: 'icons/icon-192.png' });
      return; // สำเร็จ - เบราว์เซอร์/OS เล่นเสียงแจ้งเตือนมาตรฐานให้เองแล้ว ไม่ต้องทำอะไรเพิ่ม
    } catch (e) { /* ตกไป beep สำรองด้านล่าง */ }
  }
  // สำรอง: ถ้ายังไม่ได้อนุญาต หรือเบราว์เซอร์ไม่รองรับ Notification เลย ใช้เสียง beep ธรรมดาแทน
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.35);
  } catch (e) { /* เบราว์เซอร์ไม่รองรับเสียงเลย ปล่อยผ่านเงียบๆ */ }
}

// ===== ระบบแจ้งเตือนแบบใหม่ (Real-time + ถาวร 30 วัน) แทนระบบเดิมทั้งหมด =====
var lastNotifications = [];
var isFirstNotifSnapshot = true;

function setupNotificationsRealtimeListener() {
  var myId = localStorage.getItem(ACCOUNT_ID_KEY);
  if (!myId) return;

  fbDb.collection('notifications').where('recipientId', '==', myId)
    .onSnapshot(function (snapshot) {
      // เล่นเสียงเฉพาะตอนมีรายการใหม่เข้ามาจริง (ไม่ใช่ตอนโหลดครั้งแรก)
      if (!isFirstNotifSnapshot) {
        snapshot.docChanges().forEach(function (change) {
          if (change.type === 'added') {
            var d = change.doc.data();
            playNotificationSound(d.title || 'C2 Calendar', d.body || '');
          }
        });
      }
      isFirstNotifSnapshot = false;

      lastNotifications = snapshot.docs.map(function (d) {
        return Object.assign({ id: d.id }, d.data());
      }).sort(function (a, b) {
        var ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
        var tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
        return tb - ta;
      });

      var unreadCount = lastNotifications.filter(function (n) { return !n.read; }).length;
      var badge = document.getElementById('notif-badge');
      if (badge) {
        if (unreadCount > 0) { badge.textContent = unreadCount; badge.style.display = 'flex'; }
        else { badge.style.display = 'none'; }
      }

      // ถ้า modal เปิดอยู่ ให้ render รายการใหม่ทันที
      if (document.getElementById('my-requests-modal-overlay').style.display === 'flex') {
        renderNotificationsList();
      }
    }, function (err) {
      console.error('ฟังการแจ้งเตือนไม่สำเร็จ', err);
    });
}

function renderNotificationsList() {
  var container = document.getElementById('my-requests-list');
  if (lastNotifications.length === 0) {
    container.innerHTML = '<p style="font-size:13px;color:#9aa1a8">ยังไม่มีการแจ้งเตือน</p>';
    return;
  }
  container.innerHTML = '';
  lastNotifications.forEach(function (n) {
    var card = document.createElement('div');
    card.className = 'request-card' + (n.read ? '' : ' notif-unread');
    var timeLabel = n.createdAt && n.createdAt.toDate ? n.createdAt.toDate().toLocaleString('th-TH') : '';

    var actionsHtml = '';
    if (n.type === 'changeRequestNew' && !n.read) {
      actionsHtml = '<div class="rc-actions">' +
        '<button class="btn-approve" onclick="approveFromNotification(this, \'' + n.requestId + '\', \'' + n.id + '\')">อนุมัติ</button>' +
        '<button class="btn-reject" onclick="rejectFromNotification(this, \'' + n.requestId + '\', \'' + n.id + '\')">ไม่อนุมัติ</button>' +
        '</div>';
    }

    card.innerHTML =
      '<div class="rc-top"><span class="rc-task">' + n.body + '</span></div>' +
      '<p class="rc-meta">' + timeLabel + '</p>' + actionsHtml;

    if (!n.read && n.type !== 'changeRequestNew') {
      card.style.cursor = 'pointer';
      card.onclick = function () { markNotificationReadAndRefresh(n.id); };
    }
    container.appendChild(card);
  });
}

function markNotificationReadAndRefresh(notificationId) {
  var token = localStorage.getItem(TOKEN_KEY);
  callApi('markNotificationRead', { token: token, notificationId: notificationId }).then(function () {
    var n = lastNotifications.find(function (x) { return x.id === notificationId; });
    if (n) n.read = true;
    renderNotificationsList();
  });
}

function approveFromNotification(btn, requestId, notificationId) {
  var token = localStorage.getItem(TOKEN_KEY);
  setButtonLoading(btn, true, 'กำลังอนุมัติ...');
  callApi('approveChangeRequest', { token: token, requestId: requestId }).then(function (result) {
    if (result.success) {
      Toast.fire({ icon: 'success', title: 'อนุมัติแล้ว' });
      markNotificationReadAndRefresh(notificationId);
    } else {
      Swal.fire({ icon: 'error', title: 'ไม่สำเร็จ', text: result.message });
      setButtonLoading(btn, false);
    }
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
    setButtonLoading(btn, false);
  });
}

function rejectFromNotification(btn, requestId, notificationId) {
  var token = localStorage.getItem(TOKEN_KEY);
  setButtonLoading(btn, true, 'กำลังปฏิเสธ...');
  callApi('rejectChangeRequest', { token: token, requestId: requestId }).then(function (result) {
    if (result.success) {
      Toast.fire({ icon: 'success', title: 'ไม่อนุมัติคำขอนี้แล้ว' });
      markNotificationReadAndRefresh(notificationId);
    } else {
      Swal.fire({ icon: 'error', title: 'ไม่สำเร็จ', text: result.message });
      setButtonLoading(btn, false);
    }
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
    setButtonLoading(btn, false);
  });
}

function openMyRequestsModal() {
  document.getElementById('my-requests-modal-overlay').style.display = 'flex';
  renderNotificationsList();
}
function closeMyRequestsModal() {
  document.getElementById('my-requests-modal-overlay').style.display = 'none';
}

function manualRefresh() {
  var icon = document.getElementById('refresh-icon');
  icon.classList.add('spinning');

  var token = localStorage.getItem(TOKEN_KEY);
  var role = localStorage.getItem(ROLE_KEY);
  Promise.all([
    loadHolidays(),
    loadMemberSidebar(),
    loadTodoList()
  ]).then(function () {
    if (token) { loadAdminEvents(token); } else { loadPublicEvents(); }
    Toast.fire({ icon: 'success', title: 'รีเฟรชข้อมูลแล้ว' });
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'รีเฟรชไม่สำเร็จ', text: err.message });
  }).finally(function () {
    setTimeout(function () { icon.classList.remove('spinning'); }, 300);
  });
}

// เก็บชื่อฟังก์ชันไว้ให้ทุกจุดที่เรียกใช้ทั่วไฟล์ (~12 จุด) ยังทำงานได้โดยไม่ต้องแก้ทีละจุด
// แต่ไม่ต้องทำอะไรจริงแล้ว เพราะ setupTasksRealtimeListener() ทำให้ปฏิทินอัปเดตอัตโนมัติทุกครั้งที่ข้อมูลเปลี่ยนอยู่แล้ว
function loadPublicEvents() {
  // no-op: real-time listener จัดการให้แล้ว
}

function loadAdminEvents(token) {
  // no-op: real-time listener จัดการให้แล้ว (พารามิเตอร์ token ไม่ได้ใช้แล้ว เก็บไว้กันจุดเรียกใช้เดิมพัง)
}

function renderCalendar(result) {
  if (!result.success) {
    console.error(result.message);
    hidePageLoading();
    return;
  }

  if (calendarInstance) {
    calendarInstance.removeAllEvents();
    calendarInstance.addEventSource(result.events);
    return;
  }

  var calendarEl = document.getElementById('calendar');
  var mobile = isMobileView();
  var savedViewPref = localStorage.getItem(CALENDAR_VIEW_PREF_KEY);
  var initialViewToUse = mobile ? (savedViewPref || 'listMonth') : 'dayGridMonth';
  calendarInstance = new FullCalendar.Calendar(calendarEl, {
    initialView: initialViewToUse,
    headerToolbar: mobile
      ? { left: 'prev,next', center: 'title', right: 'today' }
      : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
    locale: 'th',
    height: 'auto',
    eventDisplay: 'block',
    allDayText: 'ทั้งวัน',
    buttonText: { today: 'วันนี้' },
    events: result.events,
    datesSet: function (arg) {
      renderMonthHolidayList(arg.view.currentStart, arg.view.currentEnd);
    },
    dayCellDidMount: function (arg) {
      var d = arg.date;
      var dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      var matched = holidaysCache.filter(function (h) {
        if (h.type === 'date') return h.value === dateStr;
        return h.type === 'weekly' && d.getDay() === h.value;
      });
      if (matched.length === 0) return;

      var frame = arg.el.querySelector('.fc-daygrid-day-frame') || arg.el;
      frame.classList.add('fc-holiday-cell');
      var label = document.createElement('div');
      label.className = 'holiday-cell-label';
      label.textContent = matched.map(function (h) { return h.name; }).join(', ');
      frame.appendChild(label);
    },
    eventContent: function (arg) {
      if (arg.event.extendedProps.isHoliday) return true;
      var staff = arg.event.extendedProps.staff || [];
      var shown = staff.slice(0, 4);
      var dotsHtml = shown.map(function (s) {
        return '<span style="width:7px;height:7px;border-radius:50%;background:' + s.color +
          ';display:inline-block;flex-shrink:0"></span>';
      }).join('');
      if (staff.length > 4) {
        dotsHtml += '<span style="font-size:10px;color:inherit">+' + (staff.length - 4) + '</span>';
      }

      var isListView = arg.view.type.indexOf('list') === 0;

      // งานระบุเวลาในโหมด Grid (PC) เดิมไม่โชว์เวลาเลย เพิ่มให้เห็นชัดว่างานเริ่มกี่โมง
      var timeHtml = '';
      if (!arg.event.allDay && !isListView) {
        var timeText = arg.event.start.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        timeHtml = '<span style="font-size:10px;font-weight:700;flex-shrink:0">' + timeText + '</span>';
      }

      var wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = isListView ? 'column' : 'row';
      wrapper.style.alignItems = isListView ? 'flex-start' : 'center';
      wrapper.style.gap = '3px';
      wrapper.style.overflow = 'hidden';
      wrapper.style.padding = '1px 2px';
      wrapper.style.width = '100%';
      wrapper.style.minWidth = '0';

      var topRow = document.createElement('div');
      topRow.style.display = 'flex';
      topRow.style.alignItems = 'center';
      topRow.style.gap = '3px';
      topRow.style.overflow = 'hidden';
      topRow.style.width = '100%';
      topRow.style.minWidth = '0';
      topRow.innerHTML = timeHtml + dotsHtml;

      var titleSpan = document.createElement('span');
      titleSpan.style.overflow = 'hidden';
      titleSpan.style.textOverflow = 'ellipsis';
      titleSpan.style.whiteSpace = 'nowrap';
      titleSpan.style.minWidth = '0';
      titleSpan.style.flex = '1';
      if (isListView) titleSpan.style.fontWeight = '600';
      titleSpan.textContent = arg.event.title;
      topRow.appendChild(titleSpan);
      wrapper.appendChild(topRow);

      if (isListView) {
        var dateLabel = document.createElement('div');
        dateLabel.style.fontSize = '12px';
        dateLabel.style.color = '#6b7280';
        dateLabel.textContent = formatEventDateRange(arg.event);
        wrapper.appendChild(dateLabel);
      }

      return { domNodes: [wrapper] };
    },
    eventDidMount: function (arg) {
      if (arg.event.extendedProps.isHoliday) return;
      var isListView = arg.view.type.indexOf('list') === 0;
      if (!isListView) return; // Grid มีแถบสีเต็มอยู่แล้ว ไม่ต้องเพิ่ม
      var color = arg.event.backgroundColor || arg.event.borderColor || '#f4f5f7';
      arg.el.style.backgroundColor = hexToRgba(color, 0.22);
    },
    eventClick: function (info) {
      if (info.event.extendedProps.isHoliday) return;
      var props = info.event.extendedProps;
      var taskId = info.event.id;
      var staffHtml = props.staff.map(function (s) {
        return '<span style="display:inline-flex;align-items:center;gap:5px;margin-right:10px">' +
          '<span style="width:9px;height:9px;border-radius:50%;background:' + s.color + ';display:inline-block"></span>' +
          s.name + '</span>';
      }).join('');
      var detailHtml =
        '<div style="text-align:left;font-size:14px">' +
        '<p><b>ประเภทงาน:</b> ' + (TASK_TYPE_LABELS[props.taskType] || props.taskType) + '</p>' +
        '<p><b>วันที่:</b> ' + formatEventDateRange(info.event) + '</p>' +
        '<p><b>ผู้ปฏิบัติงาน:</b><br>' + (staffHtml || '-') + '</p>' +
        '<p><b>สถานที่:</b> ' + (props.location || '-') + '</p>' +
        '<p><b>รายละเอียดงาน:</b><br>' + (props.detail ? props.detail.replace(/\n/g, '<br>') : '-') + '</p>' +
        '</div>';

      var token = localStorage.getItem(TOKEN_KEY);
      var myRole = localStorage.getItem(ROLE_KEY);
      var myAccountId = localStorage.getItem(ACCOUNT_ID_KEY);

      if (!token) {
        Swal.fire({ title: info.event.title, html: detailHtml, confirmButtonText: 'ปิด' });
        return;
      }

      if (myRole === 'admin' || myRole === 'ceo') {
        Swal.fire({
          title: info.event.title, html: detailHtml,
          showDenyButton: true, showCancelButton: true,
          confirmButtonText: 'แก้ไข', denyButtonText: 'ลบงาน', cancelButtonText: 'ปิด'
        }).then(function (res) {
          if (res.isConfirmed) {
            openTaskModalForEdit(taskId);
          } else if (res.isDenied) {
            deleteTaskConfirm(taskId);
          }
        });
        return;
      }

      // Staff: ขอลบ/ขอเปลี่ยนวัน ได้ทั้งงานที่ตัวเองสร้าง และงานที่มีชื่อตัวเองเป็นผู้ปฏิบัติงาน
      var isOwner = props.createdBy === myAccountId || (props.staffIds || []).indexOf(myAccountId) !== -1;
      if (!isOwner) {
        Swal.fire({ title: info.event.title, html: detailHtml, confirmButtonText: 'ปิด' });
        return;
      }

      Swal.fire({
        title: info.event.title, html: detailHtml,
        showDenyButton: true, showCancelButton: true,
        confirmButtonText: 'ขอเปลี่ยนวัน', denyButtonText: 'ขอลบงาน', cancelButtonText: 'ปิด'
      }).then(function (res) {
        if (res.isConfirmed) {
          openRescheduleModal(taskId);
        } else if (res.isDenied) {
          requestDeleteTaskConfirm(taskId);
        }
      });
    }
  });
  calendarInstance.render();
  updateViewToggleLabel(initialViewToUse);
  hidePageLoading();
}