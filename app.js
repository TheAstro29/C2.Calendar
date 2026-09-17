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

// key นี้ถูก restrict ไว้แล้ว (Application restriction: จำกัดเฉพาะโดเมนเว็บนี้, API restriction: จำกัดเฉพาะ
// Firestore/Storage/Auth/Installations + Maps JavaScript/Places/Geocoding เท่านั้น) — ถ้าจะเปลี่ยน key ใหม่
// อย่าลืม restrict ให้ครบทั้งสองแบบเหมือนกันก่อนใช้งานจริง
var GOOGLE_MAPS_API_KEY = 'AIzaSyBjJLodAV1hkgaxxmgzvccMVAIW5S8hbqw';

// ============================================================
// เชื่อมปุ่ม Back ของระบบ (มือถือ/เบราว์เซอร์) เข้ากับการปิด modal ต่างๆ
// หลักการ: ทุกครั้งที่เปิด modal ใดๆ ให้บันทึกไว้ใน browser history (pushState) ด้วย ไม่ใช่แค่โชว์ DOM เฉยๆ
// แล้วดักฟัง popstate (ตอนกด back) เพื่อสั่งปิด modal ที่เปิดอยู่ (เรียกฟังก์ชันปิดจริงเพื่อให้ cleanup ทำงานครบ)
// แทนที่จะปล่อยให้เบราว์เซอร์ปิดแอป/ออกจากหน้าปฏิทินไปเลยทั้งที่ผู้ใช้แค่อยากปิดหน้าต่างที่เปิดอยู่
// ============================================================
var _navRestoringCal = false;

var _MODAL_CLOSE_FN = {
  "login-modal-overlay": function () { closeLoginModal(); },
  "staff-modal-overlay": function () { closeStaffModal(); },
  "task-modal-overlay": function () { closeTaskModal(); },
  "holiday-modal-overlay": function () { closeHolidayModal(); },
  "dashboard-modal-overlay": function () { closeDashboardModal(); },
  "profile-modal-overlay": function () { closeProfileModal(); },
  "reschedule-modal-overlay": function () { closeRescheduleModal(); },
  "my-requests-modal-overlay": function () { closeMyRequestsModal(); },
  "task-detail-modal-overlay": function () { closeTaskDetailModal(); },
  "todo-board-modal-overlay": function () { closeTodoBoardModal(); },
  "task-board-modal-overlay": function () { closeTaskBoardModal(); },
  "personal-task-modal-overlay": function () { closePersonalTaskModal(); },
  "task-export-modal-overlay": function () { closeTaskExportModal(); },
};

function _pushModalNav(overlayId) {
  if (_navRestoringCal) return;
  try { history.pushState({ __c2calnav: true, modal: overlayId }, ""); } catch (e) {}
}

window.addEventListener("popstate", function () {
  _navRestoringCal = true;
  // ปิด modal overlay ที่เปิดอยู่ทั้งหมด (ปกติเปิดทีละอันในเวลาเดียวกัน)
  document.querySelectorAll('[id$="-modal-overlay"]').forEach(function (el) {
    if (el.style.display === "flex" && _MODAL_CLOSE_FN[el.id]) {
      _MODAL_CLOSE_FN[el.id]();
    }
  });
  _navRestoringCal = false;
});

var TOKEN_KEY = 'c2tech_token';
var NAME_KEY = 'c2tech_admin_name';
var ROLE_KEY = 'c2tech_role';
var ACCOUNT_ID_KEY = 'c2tech_account_id';
var calendarInstance = null;

// ===== Phase: ปุ่มสลับธีม Light/Dark เอง (นอกเหนือจากปรับตาม prefers-color-scheme อัตโนมัติ) =====
// index.html มี inline script เล็กๆ ก่อนโหลด style.css คอยเซ็ต data-theme จาก localStorage ให้ตั้งแต่ต้น
// (กัน "จอกระพริบ" สีผิดตอนโหลดหน้าแรกก่อนสคริปต์นี้มาถึง) ฟังก์ชันด้านล่างนี้ใช้ตอนกดปุ่มสลับเองอีกที
var THEME_PREF_KEY = 'c2tech_calendar_theme_pref';
var THEME_CYCLE = ['system', 'light', 'dark'];
var THEME_META = {
  system: { icon: '🌓', label: 'ธีม: ตามเครื่อง' },
  light: { icon: '☀️', label: 'ธีม: สว่าง' },
  dark: { icon: '🌙', label: 'ธีม: มืด' }
};
function getThemePref() {
  var v = localStorage.getItem(THEME_PREF_KEY);
  return (v === 'light' || v === 'dark') ? v : 'system';
}
function applyThemePref(pref) {
  if (pref === 'light' || pref === 'dark') {
    document.documentElement.setAttribute('data-theme', pref);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  var btn = document.getElementById('theme-toggle-btn');
  if (btn) {
    btn.textContent = THEME_META[pref].icon;
    btn.title = THEME_META[pref].label + ' (กดเพื่อเปลี่ยน)';
  }
}
function cycleTheme() {
  var current = getThemePref();
  var next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length];
  localStorage.setItem(THEME_PREF_KEY, next);
  applyThemePref(next);
  Toast.fire({ icon: 'success', title: THEME_META[next].label });
}
function getThemeMenuLabel() {
  var pref = getThemePref();
  return THEME_META[pref].icon + ' ' + THEME_META[pref].label + ' (กดเพื่อเปลี่ยน)';
}

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
  'getMyProfile', 'updateOwnProfile', 'changeOwnPassword', 'markNotificationRead',
  'addTaskTag', 'createPersonalTask', 'updatePersonalTaskStatus', 'updatePersonalTask', 'deletePersonalTask',
  'toggleChecklistItem', 'registerTaskAttachment', 'getCompanyTaskSummary', 'exportTaskReport'
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
      tasks.push({
        taskId: doc.id, taskName: row.taskName, detail: row.detail, taskType: row.taskType, staff: staff,
        createdBy: row.createdBy || '', staffIds: row.staffIds || [],
        createdAt: firestoreDateToIso(row.createdAt)
      });
    });
    // งานที่เพิ่มล่าสุดอยู่บนสุด (เรียงตาม createdAt ใหม่ -> เก่า) — งานเก่าที่ไม่มี createdAt (ข้อมูลเก่าก่อนมีฟิลด์นี้)
    // จะตกไปอยู่ท้ายสุดแทนที่จะพังลำดับ
    tasks.sort(function (a, b) {
      return (b.createdAt || '') < (a.createdAt || '') ? -1 : (b.createdAt || '') > (a.createdAt || '') ? 1 : 0;
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

// ===== Phase: การ์ดประเภทงาน (ไซด์บาร์ขวา) กดเพื่อกรองปฏิทิน — กดซ้ำ/กด "ล้างตัวกรอง" เพื่อยกเลิก =====
var activeTaskTypeFilter = null;
function setTaskTypeFilter(type) {
  activeTaskTypeFilter = (activeTaskTypeFilter === type) ? null : type;

  // #type-legend-mobile คือแถบชิปกรองบนมือถือ (เหนือปฏิทิน) - ใช้ data-type/class เดียวกับ #type-legend
  // ฝั่ง PC จึงอัปเดตสถานะ active/dimmed พร้อมกันในลูปเดียวได้เลย ไม่ต้องแยกฟังก์ชัน
  document.querySelectorAll('#type-legend .legend-item, #type-legend-mobile .legend-item').forEach(function (el) {
    var isThis = el.getAttribute('data-type') === activeTaskTypeFilter;
    el.classList.toggle('active', !!activeTaskTypeFilter && isThis);
    el.classList.toggle('dimmed', !!activeTaskTypeFilter && !isThis);
  });
  document.getElementById('type-filter-reset').classList.toggle('show', !!activeTaskTypeFilter);

  // สั่งให้ FullCalendar ประเมิน eventClassNames ใหม่กับ event ที่กำลังโชว์อยู่ (ไม่โหลดข้อมูลใหม่จากเซิร์ฟเวอร์)
  if (calendarInstance) calendarInstance.render();
}

// นับจำนวนงานแต่ละประเภทเฉพาะ "ช่วงที่ปฏิทินกำลังแสดงอยู่" (เดือน/สัปดาห์/วัน/ปี ตามมุมมองปัจจุบัน) แล้วเติมท้าย
// ชื่อประเภทงานในไซด์บาร์ — ใช้ event.start เทียบกับ view.currentStart/currentEnd แบบเดียวกับที่ renderMonthHolidayList
// ใช้เทียบวันหยุด เพื่อให้ความหมาย "ในเดือนนั้น" ตรงกันทั้งแอป
function updateLegendCounts() {
  if (!calendarInstance) return;
  var view = calendarInstance.view;
  var start = view.currentStart, end = view.currentEnd;
  var counts = { meeting: 0, onsite: 0, event: 0, leave: 0 };
  calendarInstance.getEvents().forEach(function (ev) {
    if (ev.extendedProps.isHoliday) return;
    var t = ev.extendedProps.taskType;
    if (!counts.hasOwnProperty(t)) return;
    if (!ev.start || ev.start < start || ev.start >= end) return;
    counts[t]++;
  });
  document.querySelectorAll('#type-legend .legend-item').forEach(function (el) {
    var t = el.getAttribute('data-type');
    var countEl = el.querySelector('.legend-count');
    if (countEl) countEl.textContent = counts[t] || 0;
  });
}

// ===== จับคู่ staffId -> ข้อมูลคน (เดิมฝั่ง server join ให้ ตอนนี้ทำเองฝั่ง client จาก staffMapCache) =====
var staffMapCache = {};
var lastRenderedEvents = [];

function firestoreDateToJs(val) {
  // แก้บั๊ก "Invalid Date": Firestore Timestamp ที่วิ่งผ่าน Cloud Function callable protocol โดยไม่ได้แปลง
  // เป็น ISO string ก่อนส่งออก (ทำถูกแล้วในฟังก์ชันปัจจุบันส่วนใหญ่ แต่กันเผื่อจุดอื่นในอนาคตพลาด) จะกลาย
  // เป็น plain object {_seconds, _nanoseconds} ที่ไม่มี .toDate() แล้ว new Date(val) เจอ object แบบนี้จะ
  // แปลงผ่าน toString() กลายเป็น "[object Object]" แล้วได้ Invalid Date กลับมาแทน จับ shape นี้ไว้ก่อนเลย
  if (!val) return null;
  if (val.toDate) return val.toDate(); // Firestore Timestamp instance จริง (client SDK อ่านตรง)
  if (typeof val === 'object' && (val._seconds !== undefined || val.seconds !== undefined)) {
    var secs = val._seconds !== undefined ? val._seconds : val.seconds;
    return new Date(secs * 1000);
  }
  var d = new Date(val);
  return isNaN(d.getTime()) ? null : d; // parse ไม่ออกจริงๆ คืน null ดีกว่าคืน Invalid Date object
  // (ปลายทางที่ใช้ค่านี้ เช่น fmtPtbDate ต่างเช็ค falsy อยู่แล้ว จะได้โชว์ "-" แทนข้อความ "Invalid Date")
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
  // ปุ่มสลับธีมยังไม่มีตอน inline script ใน <head> เซ็ต data-theme ไว้ตั้งแต่ก่อนหน้านี้ (กันจอกระพริบ)
  // ต้อง sync ไอคอน/ label ของปุ่มให้ตรงกับค่าที่จำไว้อีกทีตอนนี้ ที่ DOM ของปุ่มพร้อมแล้ว
  applyThemePref(getThemePref());
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
  _pushModalNav('login-modal-overlay');
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
  document.getElementById('task-undated-row').style.display = (isAdmin || isStaff || role === 'ceo') ? 'flex' : 'none';
  document.getElementById('taskboard-sidebar-section').style.display = 'block'; // ทุก role ที่ login แล้วมี Task Board ของตัวเองได้
  requestNotificationPermission();
  setupNotificationsRealtimeListener();
  setupPersonalTasksListener();
  loadTodoList();
}

function exitAdminMode() {
  document.getElementById('login-icon-btn').style.display = 'flex';
  document.getElementById('admin-chip').style.display = 'none';
  document.getElementById('task-undated-row').style.display = 'none';
  document.getElementById('notif-bell-btn').style.display = 'none';
  document.getElementById('export-excel-btn').style.display = 'none';
  document.getElementById('dashboard-btn').style.display = 'none';
  document.getElementById('taskboard-sidebar-section').style.display = 'none';
  teardownPersonalTasksListener();
  lastNotifications = [];
  isFirstNotifSnapshot = true;
  loadTodoList();
}

function openStaffModal() {
  document.getElementById('staff-modal-overlay').style.display = 'flex';
  loadStaffList();
  _pushModalNav('staff-modal-overlay');
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

  var ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path></svg>';
  var ICON_KEY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7.5" cy="15.5" r="5.5"></circle><path d="M21 2l-9.6 9.6"></path><path d="M15.5 7.5 18 10"></path><path d="M18.5 4.5 21 7"></path></svg>';
  var ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>';

  container.innerHTML = '';
  result.staff.forEach(function (s) {
    var color = s.colorHex || '#888780';
    var textColor = getContrastTextColor(color);
    var initial = (s.firstName || '?').charAt(0);
    var fullName = (s.firstName + ' ' + s.lastName).replace(/'/g, '');

    var row = document.createElement('div');
    row.className = 'staff-row';
    row.innerHTML =
      '<div class="sr-avatar" style="background:' + color + '">' +
        (s.photoURL
          ? '<img src="' + s.photoURL + '" alt="">'
          : '<span style="color:' + textColor + '">' + initial + '</span>') +
      '</div>' +
      '<div class="staff-info">' +
        '<div class="name-line">' +
          '<p class="name">' + s.firstName + ' ' + s.lastName + '</p>' +
          '<span class="role-badge ' + s.role + '">' + (ROLE_LABELS[s.role] || s.role) + '</span>' +
          (s.username ? '<span class="id-badge">ID: ' + escapeHtmlPtb(s.username) + '</span>' : '') +
        '</div>' +
        '<p class="pos">' + (s.position || 'ไม่ระบุตำแหน่ง') + '</p>' +
        '<p class="meta">' + (s.phone || 'ไม่ระบุเบอร์โทร') + '</p>' +
      '</div>' +
      '<div class="sr-actions">' +
        '<div class="sr-icon-row">' +
          '<button class="sr-icon-btn" title="แก้ไข" onclick=\'startEditStaff(' + JSON.stringify(s) + ')\'>' + ICON_EDIT + '</button>' +
          '<button class="sr-icon-btn" title="รีเซ็ตรหัส" onclick="resetPasswordConfirm(this, \'' + s.staffId + '\', \'' + fullName + '\')">' + ICON_KEY + '</button>' +
          '<button class="sr-icon-btn danger" title="ลบบัญชี" onclick="deleteStaffConfirm(this, \'' + s.staffId + '\', \'' + fullName + '\')">' + ICON_TRASH + '</button>' +
        '</div>' +
        '<label class="sr-toggle">' +
          '<input type="checkbox" ' + (s.active ? 'checked' : '') + ' onchange="toggleStaffActive(this, \'' + s.staffId + '\', this.checked)">' +
          'ใช้งาน' +
        '</label>' +
      '</div>';
    container.appendChild(row);
  });
}

var editingStaffId = null;

// ปุ่ม segmented เลือกสิทธิ์/เพศ - เก็บค่าจริงไว้ใน <select> ที่ซ่อนอยู่ (ของเดิม backend ยังอ่านจากตรงนี้)
function setStaffRole(value) {
  document.getElementById('staff-role').value = value;
  var buttons = document.querySelectorAll('#staff-role-segmented button');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle('active', buttons[i].getAttribute('data-value') === value);
  }
}
function setStaffGender(value) {
  document.getElementById('staff-gender').value = value;
  var buttons = document.querySelectorAll('#staff-gender-segmented button');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle('active', buttons[i].getAttribute('data-value') === value);
  }
}

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
  setStaffRole(s.role || 'staff');
  setStaffGender(s.gender || '');
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
  setStaffRole('staff');
  setStaffGender('');
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

// ===== ระบบปรับแต่งข้อความ (ตัวหนา/ตัวเอียง/ขนาด/สี) สำหรับช่อง "รายละเอียดงาน" ในฟอร์มสร้าง/แก้ไขงาน =====
// เก็บเป็น HTML ที่จำกัดชนิด tag ไว้ (กรองผ่าน sanitizeRichText ทั้งตอนโหลดเข้ากล่องและตอนบันทึก กัน HTML/สไตล์
// แปลกปลอมหลุดเข้ามา) ส่วนที่ export ออกเป็น Excel หรือแสดงในที่ที่ต้องการข้อความล้วนใช้ stripHtmlToText แทน
var RICH_TEXT_ALLOWED_TAGS = { B: 1, STRONG: 1, I: 1, EM: 1, BR: 1, SPAN: 1, DIV: 1 };

function sanitizeRichText(html) {
  var container = document.createElement('div');
  container.innerHTML = html || '';
  (function walk(node) {
    var child = node.firstChild;
    while (child) {
      var next = child.nextSibling;
      if (child.nodeType === 1) {
        var tag = child.tagName;
        if (!RICH_TEXT_ALLOWED_TAGS[tag]) {
          // tag ที่ไม่อนุญาต - unwrap เอาแค่เนื้อหาข้างในออกมาแทนที่จะตัดทิ้งทั้งหมด
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
          child = next;
          continue;
        }
        // ลบ attribute เดิมทั้งหมด เหลือแค่ style ที่กรองแล้ว (เฉพาะ span, เฉพาะ color/font-size)
        var keepStyle = '';
        if (tag === 'SPAN' && child.style) {
          if (child.style.color) keepStyle += 'color:' + child.style.color + ';';
          if (child.style.fontSize) keepStyle += 'font-size:' + child.style.fontSize + ';';
        }
        for (var i = child.attributes.length - 1; i >= 0; i--) {
          child.removeAttribute(child.attributes[i].name);
        }
        if (keepStyle) child.setAttribute('style', keepStyle);
        walk(child);
      } else if (child.nodeType !== 3) {
        // ไม่ใช่ text node หรือ element ที่อนุญาต (เช่น comment) - ตัดทิ้ง
        node.removeChild(child);
      }
      child = next;
    }
  })(container);
  return container.innerHTML;
}

function stripHtmlToText(html) {
  var d = document.createElement('div');
  d.innerHTML = html || '';
  d.querySelectorAll('br').forEach(function (el) { el.replaceWith('\n'); });
  d.querySelectorAll('div').forEach(function (el) { el.insertAdjacentText('beforebegin', '\n'); });
  return (d.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

// แถบเครื่องมือปรับแต่งข้อความใช้ร่วมกันได้หลายจุดในหน้าเว็บ (ฟอร์มงานปฏิทินหลัก + ฟอร์ม Personal Task Board)
// โดยไม่ต้องพึ่ง id ตายตัว - แต่ละจุดห่อด้วย .rt-group (แถบเครื่องมือ + กล่อง .rt-editable) แล้วหาเป้าหมายจาก
// element ที่ถูกคลิกด้วย .closest('.rt-group') เอาเอง กันปัญหา id ซ้ำกันเวลามีมากกว่า 1 จุดในหน้าเดียวกัน
function rtGroupEditable(fromEl) {
  var group = fromEl && fromEl.closest ? fromEl.closest('.rt-group') : null;
  return group ? group.querySelector('.rt-editable') : null;
}

function richTextExec(cmd, btn) {
  var el = rtGroupEditable(btn);
  if (!el) return;
  el.focus();
  document.execCommand(cmd, false, null);
}

function richTextApplySize(sizePx, fromEl) {
  var el = rtGroupEditable(fromEl);
  if (!el) return;
  el.focus();
  if (!sizePx) return; // "ปกติ" - ไม่ต้องห่อ span เพิ่ม ใช้ขนาดเริ่มต้นของกล่อง
  wrapSelectionStyle(el, 'fontSize', sizePx);
}

function richTextApplyColor(hex, dot) {
  var el = rtGroupEditable(dot);
  if (!el) return;
  el.focus();
  wrapSelectionStyle(el, 'color', hex);
  var group = dot.closest('.rt-group');
  (group || document).querySelectorAll('.rt-color-dot').forEach(function (d) { d.classList.remove('selected'); });
  dot.classList.add('selected');
}

function wrapSelectionStyle(el, styleProp, styleValue) {
  var sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
    Toast.fire({ icon: 'info', title: 'เลือกข้อความที่ต้องการปรับก่อน' });
    return;
  }
  var range = sel.getRangeAt(0);
  if (!el.contains(range.commonAncestorContainer)) return;
  var span = document.createElement('span');
  span.style[styleProp] = styleValue;
  try {
    range.surroundContents(span);
  } catch (e) {
    // selection คร่อมหลาย element (เช่น ครอบ tag เปิด-ปิดไม่สมบูรณ์) - surroundContents ใช้ไม่ได้ ใช้ extract+insert แทน
    var frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }
  // แก้บั๊ก: ถ้า selection ยาวคร่อมเข้าไปใน span ที่เคยตั้งสี/ขนาดไว้ก่อนหน้า (เช่นคร่อมเข้าไปครึ่งหนึ่งของคำที่เคยเปลี่ยนสีไว้)
  // ตอน extractContents ตัดสกัดออกมา เบราว์เซอร์จะ clone tag เก่าคร่อมส่วนที่ถูกตัดไว้ให้อัตโนมัติเพื่อรักษาโครงสร้าง DOM เดิม
  // ทำให้ span เก่า (พร้อมสี/ขนาดเดิม) ไปซ้อนอยู่ "ข้างใน" span ใหม่ที่เพิ่งสร้าง แล้วชนะค่าใหม่ที่เพิ่งตั้ง เพราะ element ที่อยู่ลึกกว่า
  // มีสิทธิ์เหนือกว่าตามกฎ CSS cascade - เป็นสาเหตุที่เปลี่ยนสีแล้วดูเหมือนไม่ขึ้น (มักเกิดกับ selection ยาวๆ ที่คร่อมคำที่เคยจัดสไตล์ไว้)
  // แก้ด้วยการล้างค่า style ตัวเดียวกัน (เช่น color หรือ font-size) ออกจาก element ลูกทุกตัวที่อยู่ใน span ใหม่
  span.querySelectorAll('[style]').forEach(function (node) {
    node.style[styleProp] = '';
    if (!node.getAttribute('style')) node.removeAttribute('style');
  });
  sel.removeAllRanges();
  var newRange = document.createRange();
  newRange.selectNodeContents(span);
  sel.addRange(newRange);
}

// แก้บั๊ก: ปกติพอ mousedown ไปโดนปุ่ม/จุดสีในแถบเครื่องมือ เบราว์เซอร์จะยุบ selection ที่เลือกไว้ในกล่อง
// รายละเอียดงานทิ้งไปก่อน (ตั้ง selection ใหม่ที่จุดคลิกแทน) ทำให้พอ handler ของปุ่มทำงานจริง (ตอน click)
// window.getSelection() เจอ selection ว่างไปแล้ว แม้จะเพิ่งลากเลือกข้อความไว้ก็ตาม - เห็นชัดสุดกับปุ่มสี เพราะ
// wrapSelectionStyle เช็คแล้วเจอว่า selection ยุบไปแล้ว เลยขึ้นแจ้งเตือน "เลือกข้อความก่อน" ทั้งที่เพิ่งเลือกไป
// (ปุ่มตัวหนา/ตัวเอียงก็โดนบั๊กเดียวกัน แค่ไม่ error ให้เห็น เพราะ execCommand เงียบๆ ไม่ทำอะไรถ้าไม่มี selection)
// แก้ด้วยการ preventDefault ตอน mousedown บนปุ่ม/จุดสีเหล่านี้ กัน browser ไปยุบ selection ก่อนที่ click จะทำงาน
document.addEventListener('mousedown', function (e) {
  if (e.target.closest && (e.target.closest('.rt-btn') || e.target.closest('.rt-color-dot'))) {
    e.preventDefault();
  }
});

// อัปเดตสถานะปุ่ม B/I ให้ไฮไลต์ตามตำแหน่ง cursor/selection ปัจจุบัน - ใช้ได้กับทุกจุดที่มี .rt-group
// (หา group จาก element ที่ focus อยู่ตอนนี้ ไม่ผูกกับ id ตายตัว)
document.addEventListener('selectionchange', function () {
  var active = document.activeElement;
  if (!active || !active.classList || !active.classList.contains('rt-editable')) return;
  var group = active.closest('.rt-group');
  if (!group) return;
  var boldBtn = group.querySelector('.rt-bold-btn');
  var italicBtn = group.querySelector('.rt-italic-btn');
  try {
    if (boldBtn) boldBtn.classList.toggle('active', document.queryCommandState('bold'));
    if (italicBtn) italicBtn.classList.toggle('active', document.queryCommandState('italic'));
  } catch (e) {}
});

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
  _pushModalNav('task-modal-overlay');
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
    setTaskType(task.taskType || 'meeting');
    document.getElementById('task-undated').checked = task.isUndated;
    toggleUndatedFields();

    if (!task.isUndated) {
      document.getElementById('task-allday-radio').checked = task.isAllDay;
      document.getElementById('task-timed-radio').checked = !task.isAllDay;
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
    document.getElementById('task-detail').innerHTML = sanitizeRichText(task.detail || '');

    document.getElementById('task-modal-overlay').style.display = 'flex';
    renderTaskStaffChecklist(staffListResult, task.staffIds || []);
    setupTaskMap();
    _pushModalNav('task-modal-overlay');
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
  });
}

function closeTaskModal() {
  document.getElementById('task-modal-overlay').style.display = 'none';
}

function resetTaskForm() {
  document.getElementById('task-name').value = '';
  setTaskType('meeting');
  document.getElementById('task-undated').checked = false;
  document.getElementById('task-allday-radio').checked = true;
  document.getElementById('task-timed-radio').checked = false;
  document.getElementById('task-start-date').value = '';
  document.getElementById('task-duration').value = 1;
  document.getElementById('task-start-date-t').value = '';
  document.getElementById('task-start-time').value = '09:00';
  document.getElementById('task-end-date-t').value = '';
  document.getElementById('task-end-time').value = '12:00';
  document.getElementById('task-location').value = '';
  document.getElementById('task-detail').innerHTML = '';
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
  var isAllDay = document.getElementById('task-allday-radio').checked;
  document.getElementById('allday-fields').style.display = isAllDay ? 'flex' : 'none';
  document.getElementById('timed-fields').style.display = isAllDay ? 'none' : 'block';
}

// ปุ่ม segmented เลือกประเภทงาน - เก็บค่าจริงไว้ใน <select id="task-type"> ที่ซ่อนอยู่ (ของเดิม backend ยังอ่านจากตรงนี้)
function setTaskType(value) {
  document.getElementById('task-type').value = value;
  var buttons = document.querySelectorAll('#task-type-segmented button');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle('active', buttons[i].getAttribute('data-value') === value);
  }
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
    // เดิมซ่อน Admin ออกจากตัวเลือกมอบหมายงาน - ผู้ใช้แจ้งว่าต้องเลือก Admin เป็นผู้ปฏิบัติงานได้ด้วย จึงเอาการ
    // ซ่อนออก ให้ Admin ที่ยัง active โชว์ในรายชื่อเหมือนพนักงานคนอื่นๆ ปกติ
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
    '&libraries=places&loading=async&callback=__onGoogleMapsLoaded';
  document.head.appendChild(script);
}

function initTaskMap() {
  var center = { lat: 13.7563, lng: 100.5018 };
  taskMap = new google.maps.Map(document.getElementById('task-map'), {
    center: center, zoom: 12
  });

  var locationInput = document.getElementById('task-location');
  setupLocationAutocomplete(locationInput);

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

// ===== Phase 13: ค้นหาสถานที่แบบพิมพ์แล้วขึ้นตัวเลือก (Autocomplete) =====
// เดิมใช้ google.maps.places.Autocomplete (วิดเจ็ตผูกกับ input โดยตรง) แต่ Google ปิดไม่ให้โปรเจกต์/API key ที่สร้าง
// ใหม่หลัง 1 มี.ค. 2568 ใช้วิดเจ็ตตัวนี้แล้ว (ขึ้น error เงียบๆ ใช้งานไม่ได้) จึงเปลี่ยนมาใช้ AutocompleteSuggestion
// ซึ่งเป็นชุดคำสั่งแบบ "ขอข้อมูลมาเอง" (ไม่ใช่วิดเจ็ตสำเร็จรูป) แล้วสร้างดรอปดาวน์ผลลัพธ์เองแทน ข้อดีคือยังผูกกับ
// input เดิมได้ปกติ (ตอนแก้ไขงานเดิมที่ต้องเซ็ตค่าข้อความลง input ตรงๆ ก็ยังทำได้เหมือนเดิมทุกประการ)
var locationAutocompleteSessionToken = null;
var locationAutocompleteDebounceTimer = null;

function setupLocationAutocomplete(inputEl) {
  var dropdown = document.getElementById('task-location-suggestions');

  inputEl.oninput = function () {
    var text = inputEl.value.trim();
    clearTimeout(locationAutocompleteDebounceTimer);
    if (!text) { dropdown.innerHTML = ''; dropdown.style.display = 'none'; return; }
    locationAutocompleteDebounceTimer = setTimeout(function () {
      fetchLocationSuggestions(text, dropdown, inputEl);
    }, 300);
  };

  document.addEventListener('click', function (e) {
    if (e.target !== inputEl && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
}

async function fetchLocationSuggestions(text, dropdown, inputEl) {
  try {
    var placesLib = await google.maps.importLibrary('places');
    if (!locationAutocompleteSessionToken) {
      locationAutocompleteSessionToken = new placesLib.AutocompleteSessionToken();
    }
    var result = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: text,
      sessionToken: locationAutocompleteSessionToken,
      region: 'th',
    });
    var suggestions = result.suggestions || [];
    if (!suggestions.length) { dropdown.innerHTML = ''; dropdown.style.display = 'none'; return; }

    dropdown.innerHTML = '';
    suggestions.forEach(function (s) {
      var pred = s.placePrediction;
      if (!pred) return;
      var item = document.createElement('div');
      item.className = 'location-suggestion-item';
      item.textContent = pred.text.text;
      item.onclick = function () { selectLocationSuggestion(pred, inputEl, dropdown); };
      dropdown.appendChild(item);
    });
    dropdown.style.display = 'block';
  } catch (err) {
    console.error('ค้นหาสถานที่ไม่สำเร็จ', err);
  }
}

async function selectLocationSuggestion(placePrediction, inputEl, dropdown) {
  dropdown.style.display = 'none';
  try {
    var place = placePrediction.toPlace();
    await place.fetchFields({ fields: ['formattedAddress', 'location'] });
    inputEl.value = place.formattedAddress || placePrediction.text.text;
    if (place.location && taskMap) {
      placeMarker(place.location);
      taskMap.setCenter(place.location);
      taskMap.setZoom(16);
    }
    // เริ่ม session ใหม่หลังเลือกเสร็จ 1 รอบ (ตามคำแนะนำ Google ให้คิดค่าบริการเป็นก้อนต่อ session การค้นหาแต่ละครั้ง)
    locationAutocompleteSessionToken = null;
  } catch (err) {
    console.error('โหลดรายละเอียดสถานที่ไม่สำเร็จ', err);
  }
}

function placeMarker(latLng) {
  if (taskMarker) taskMarker.setMap(null);
  taskMarker = new google.maps.Marker({ position: latLng, map: taskMap });
}

function submitAddTask() {
  var taskName = document.getElementById('task-name').value.trim();
  var isUndated = document.getElementById('task-undated').checked;
  var isAllDay = document.getElementById('task-allday-radio').checked;
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
  var taskDetailEl = document.getElementById('task-detail');
  var detail = taskDetailEl.textContent.trim() ? sanitizeRichText(taskDetailEl.innerHTML) : '';
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
      // รีเฟรช To-Do List ทุกครั้งที่บันทึกงานแบบไม่ระบุวันที่ (ไม่ใช่แค่ Admin แล้ว เพราะตอนนี้ Staff ก็สร้างงานแบบนี้ได้)
      if (localStorage.getItem(ROLE_KEY) === 'admin' || payload.isUndated) loadTodoList();
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

// ===== To-Do List (Phase: แบบ Trello) =====
// การ์ดในไซด์บาร์ขวาเหลือแค่สรุปจำนวน+avatar กดแล้วเปิด Modal บอร์ดเต็ม จัดคอลัมน์ตามประเภทงาน
// ข้อมูลจริงยังเป็นชุดเดียวกัน (งานที่ isUndated) แค่เปลี่ยนวิธีแสดงผล — โครงสร้างเดิม (.todo-item/ti-*)
// ยังใช้อยู่ข้างในการ์ดแต่ละใบของบอร์ด เพื่อคงปุ่มแก้ไข/ลบ (Admin) และแจ้งขอเปลี่ยนวัน/ลบ (เจ้าของงาน) แบบเดิมทั้งหมด
var _todoTasksCache = [];
var TASK_TYPE_COLUMN_ORDER = ['meeting', 'onsite', 'event', 'leave'];
var TODO_AVATAR_PALETTE = ['#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#10b981', '#ef4444', '#0ea5a5'];

function loadTodoList() {
  callApi('getUndatedTasks', {}).then(function (result) {
    if (!result.success) {
      document.getElementById('todo-summary-count').textContent = 'โหลดไม่สำเร็จ';
      return;
    }
    _todoTasksCache = result.tasks;
    renderTodoSummaryCard(result.tasks);
    // ถ้า Modal บอร์ดเปิดอยู่พอดี (เช่นมีคนเพิ่ม/ลบงานจากที่อื่นแบบ real-time) ให้รีเฟรชเนื้อในด้วย
    if (document.getElementById('todo-board-modal-overlay').style.display === 'flex') {
      renderKanbanBoard(result.tasks);
    }
  });
}

function renderTodoSummaryCard(tasks) {
  var countEl = document.getElementById('todo-summary-count');
  countEl.textContent = tasks.length === 0 ? 'ยังไม่มีงานในลิสต์' : tasks.length + ' งานรอกำหนดวัน';

  // รวมรายชื่อผู้ปฏิบัติงานที่ไม่ซ้ำจากทุกงาน โชว์เป็น avatar ซ้อนกันสูงสุด 4 คน
  var seen = {};
  var names = [];
  tasks.forEach(function (t) {
    (t.staff || []).forEach(function (s) {
      if (!seen[s.name]) { seen[s.name] = true; names.push(s); }
    });
  });
  var avatarsEl = document.getElementById('todo-summary-avatars');
  avatarsEl.innerHTML = '';
  names.slice(0, 4).forEach(function (s, i) {
    var av = document.createElement('div');
    av.className = 'avatar-mini';
    av.style.background = s.color || TODO_AVATAR_PALETTE[i % TODO_AVATAR_PALETTE.length];
    av.textContent = (s.name || '?').charAt(0);
    avatarsEl.appendChild(av);
  });
  if (names.length > 4) {
    var more = document.createElement('div');
    more.className = 'avatar-mini';
    more.style.background = '#9aa1a8';
    more.textContent = '+' + (names.length - 4);
    avatarsEl.appendChild(more);
  }
}

function openTodoBoardModal() {
  renderKanbanBoard(_todoTasksCache);
  document.getElementById('todo-board-modal-overlay').style.display = 'flex';
  _pushModalNav('todo-board-modal-overlay');
}
function closeTodoBoardModal() {
  document.getElementById('todo-board-modal-overlay').style.display = 'none';
}

function renderKanbanBoard(tasks) {
  var board = document.getElementById('todo-board-columns');
  var isAdmin = localStorage.getItem(ROLE_KEY) === 'admin';
  var myAccountId = localStorage.getItem(ACCOUNT_ID_KEY);

  if (tasks.length === 0) {
    board.innerHTML = '<div class="kanban-empty-all">ยังไม่มีงานในลิสต์</div>';
    return;
  }

  board.className = 'kanban-board';
  board.innerHTML = '';
  TASK_TYPE_COLUMN_ORDER.forEach(function (typeKey) {
    var colTasks = tasks.filter(function (t) { return t.taskType === typeKey; });
    var col = document.createElement('div');
    col.className = 'kanban-col';

    var head = document.createElement('div');
    head.className = 'kanban-col-head';
    head.innerHTML =
      '<span class="dot" style="background:' + (TASK_TYPE_COLORS[typeKey] || '#ccc') + '"></span>' +
      (TASK_TYPE_LABELS[typeKey] || typeKey).replace(/\s*\(.*\)/, '') +
      '<span class="n">' + colTasks.length + '</span>';
    col.appendChild(head);

    var cardsWrap = document.createElement('div');
    cardsWrap.className = 'kanban-cards';

    if (colTasks.length === 0) {
      cardsWrap.innerHTML = '<div class="kanban-empty-col">ไม่มีงาน</div>';
    } else {
      colTasks.forEach(function (t) {
        var staffNames = t.staff.map(function (s) { return s.name; }).join(', ');
        var isOwner = t.createdBy === myAccountId || (t.staffIds || []).indexOf(myAccountId) !== -1;
        var card = document.createElement('div');
        card.className = 'todo-item kanban-card';
        card.style.setProperty('--kc-color', TASK_TYPE_COLORS[typeKey] || '#ccc');
        card.innerHTML =
          '<div class="ti-top"><span class="ti-name">' + t.taskName + '</span></div>' +
          (staffNames ? '<p class="ti-staff">ผู้ปฏิบัติงาน: ' + staffNames + '</p>' : '') +
          (isAdmin ?
            '<div class="ti-actions">' +
              '<button class="btn-outline" onclick="editTodoTask(\'' + t.taskId + '\')">แก้ไข/กำหนดวัน</button>' +
              '<button class="btn-reject" onclick="deleteTodoTask(this, \'' + t.taskId + '\')">ลบ</button>' +
            '</div>' :
            (isOwner ?
              '<div class="ti-actions">' +
                '<button class="btn-outline" onclick="openRescheduleModal(\'' + t.taskId + '\')">แจ้งกำหนดวัน</button>' +
                '<button class="btn-reject" onclick="requestDeleteTaskConfirm(\'' + t.taskId + '\')">แจ้งขอลบ</button>' +
              '</div>' : ''));
        cardsWrap.appendChild(card);
      });
    }
    col.appendChild(cardsWrap);
    board.appendChild(col);
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
    title: 'ยืนยันลบงานนี้?',
    html: '<div class="td-warning-banner" style="text-align:left;justify-content:flex-start">⚠️ งานจะถูกซ่อนจากปฏิทิน แต่ข้อมูลยังเก็บไว้ดูย้อนหลังได้</div>',
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
  _pushModalNav('profile-modal-overlay');

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
  _pushModalNav('holiday-modal-overlay');
}
function closeHolidayModal() {
  document.getElementById('holiday-modal-overlay').style.display = 'none';
}

function toggleHolidayTypeFields() {
  var isWeekly = document.getElementById('holiday-type-weekly-radio').checked;
  document.getElementById('holiday-type').value = isWeekly ? 'weekly' : 'date';
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

// ===== Export ไฟล์ Excel / พิมพ์รายงาน ผ่านแท็บใหม่ แทนการบังคับดาวน์โหลด/เปิด print dialog ในเฟรมเดิม =====
// เหตุผล: C2 Calendar ถูกฝังอยู่ใน Google Sites ผ่าน iframe ซึ่ง Google ครอบ sandbox ไว้ (เจ้าของเว็บไซต์
// ปรับแต่งเองไม่ได้) sandbox นี้มักบล็อกการบังคับดาวน์โหลดไฟล์/เปิด print dialog ที่สั่งจาก JS ภายในเฟรมเดิม
// แบบเงียบๆ (กดปุ่มแล้วไม่มีอะไรเกิดขึ้นเลย) วิธีแก้คือเปิดแท็บใหม่ (top-level browsing context ที่ไม่ถูก
// sandbox ของ Google Sites ครอบ) แล้วสั่งดาวน์โหลด/พิมพ์จากในแท็บใหม่นั้นแทน
//
// ข้อควรระวัง: window.open() ต้องถูกเรียกแบบ synchronous ต่อเนื่องจาก user gesture (click) เท่านั้น ถ้าเรียก
// หลัง await/Promise (เช่นหลัง callApi รอ API ตอบกลับ) เบราว์เซอร์จะมองว่าไม่ได้มาจาก click โดยตรงแล้ว
// แล้วบล็อก popup ทันที - ฟังก์ชันที่มีการเรียก API ก่อน (doTaskExport) จึงต้องเปิดแท็บเปล่าไว้ล่วงหน้า
// ตั้งแต่ต้นฟังก์ชัน (ก่อน callApi) แล้วค่อยส่ง window ที่เปิดไว้แล้วนั้นมาเติมเนื้อหาทีหลังผ่าน preOpenedTab
function exportWorkbookViaNewTab(wb, filename, preOpenedTab) {
  var newTab = preOpenedTab || window.open('', '_blank');
  var wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  var blob = new Blob([wbout], { type: 'application/octet-stream' });
  var url = URL.createObjectURL(blob);
  if (!newTab) {
    // popup ถูกบล็อก (เช่นตั้งค่าเบราว์เซอร์ไว้เข้มงวด) - fallback กลับไปดาวน์โหลดในเฟรมเดิมแบบเดิม
    // ยังดีกว่าไม่ทำอะไรเลย แม้อาจไม่รอดจาก sandbox ของ Google Sites ก็ตาม
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    return;
  }
  var a2 = newTab.document.createElement('a');
  a2.href = url;
  a2.download = filename;
  newTab.document.body.appendChild(a2);
  a2.click();
  setTimeout(function () { URL.revokeObjectURL(url); try { newTab.close(); } catch (e) {} }, 1500);
}

// ===== รายงานสรุปผู้บริหาร (Exec Report) - A4 หนึ่งหน้า: โดนัทสัดส่วน + ภาระงานรายคน + คอลัมน์ขวา =====
// ดีไซน์นี้เลือกมาจาก preview 4 แบบที่ทำไว้ให้ผู้ใช้เทียบ (เวอร์ชันผสม: โดนัทฟอนต์ใหญ่ + ภาระงานฝั่งซ้าย +
// คำเตือน/รายการฝั่งขวา) แล้วเอามาใส่ข้อมูลจริงแทนข้อมูลจำลองตรงนี้

// สร้าง SVG โดนัทจาก segments [{label,count,color}] แบบไดนามิก (คำนวณ arc math เองไม่พึ่ง library)
function execReportBuildDonut(segments, total, r, sw, size) {
  var circumference = 2 * Math.PI * r;
  var cum = 0;
  var c = size / 2;
  var circlesHtml = segments.map(function (seg) {
    var len = total > 0 ? (seg.count / total) * circumference : 0;
    var dasharray = len.toFixed(2) + ' ' + (circumference - len).toFixed(2);
    var dashoffset = (-cum).toFixed(2);
    cum += len;
    return '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="' + seg.color + '" stroke-width="' + sw +
      '" stroke-dasharray="' + dasharray + '" stroke-dashoffset="' + dashoffset + '"></circle>';
  }).join('');
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '"><g transform="rotate(-90 ' + c + ' ' + c + ')">' + circlesHtml + '</g></svg>';
}

function execReportLegendRow(seg, total) {
  var pct = total > 0 ? Math.round(seg.count / total * 100) : 0;
  return '<div style="display:flex;align-items:center;justify-content:space-between;">' +
    '<div style="display:flex;align-items:center;gap:11px;"><span style="width:13px;height:13px;border-radius:50%;background:' + seg.color + ';display:inline-block;"></span>' +
    '<span style="font-size:17px;font-weight:500;">' + escapeHtmlPtb(seg.label) + '</span></div>' +
    '<div style="display:flex;align-items:center;gap:12px;"><span style="font-size:17px;font-weight:700;color:#201E1D;">' + seg.count + ' งาน</span>' +
    '<span style="font-size:15px;color:#63816F;width:38px;text-align:right;">' + pct + '%</span></div></div>';
}

function execReportWorkloadRow(item, maxCount) {
  var widthPct = maxCount > 0 ? Math.round(item.count / maxCount * 100) : 0;
  return '<div><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">' +
    '<div style="display:flex;align-items:center;gap:8px;"><span style="width:9px;height:9px;border-radius:50%;background:' + item.color + ';flex-shrink:0;"></span>' +
    '<span style="font-size:13px;">' + escapeHtmlPtb(item.name) + '</span></div>' +
    '<span style="font-size:13px;font-weight:700;">' + item.count + '</span></div>' +
    '<div style="height:7px;background:#F1F3F2;border-radius:4px;"><div style="width:' + widthPct + '%;height:100%;background:' + item.color + ';border-radius:4px;"></div></div></div>';
}

function execReportListRow(label, badge, badgeColor) {
  return '<div style="display:flex;align-items:center;justify-content:space-between;">' +
    '<span style="font-size:12.5px;color:#201E1D;">' + escapeHtmlPtb(label) + '</span>' +
    '<span style="font-size:11.5px;font-weight:700;color:' + badgeColor + ';flex-shrink:0;margin-left:10px;">' + escapeHtmlPtb(badge) + '</span></div>';
}

// cfg = { periodLabel, dateRangeLabel, totalLabel, donutSegments:[{label,count,color}], donutSectionTitle,
//   donutCenterPct, donutCenterSub, workload:[{name,count,color}], rightWarning:{headerText,items:[{label,badge}]}|null,
//   rightListTitle, rightListItems:[{label,badge,badgeColor}], generatedAtLabel }
function execReportHtml(cfg) {
  var total = cfg.donutSegments.reduce(function (s, x) { return s + x.count; }, 0);
  var donutSvg = execReportBuildDonut(cfg.donutSegments, total, 84, 28, 200);
  var legendHtml = cfg.donutSegments.map(function (seg) { return execReportLegendRow(seg, total); }).join('');
  var maxWorkload = cfg.workload.reduce(function (m, x) { return Math.max(m, x.count); }, 0) || 1;
  var workloadHtml = cfg.workload.map(function (item) { return execReportWorkloadRow(item, maxWorkload); }).join('');

  var warningHtml = '';
  if (cfg.rightWarning && cfg.rightWarning.items.length) {
    warningHtml = '<div style="background:#FDF2F2;border:1.5px solid #F3C7C7;border-radius:12px;padding:18px 20px;">' +
      '<div style="display:flex;align-items:center;gap:9px;margin-bottom:10px;">' +
      '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#DC2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 3.5l9.5 16.5H2.5L12 3.5z"></path><line x1="12" y1="9.5" x2="12" y2="14"></line><circle cx="12" cy="17" r="0.9" fill="#DC2626" stroke="none"></circle></svg>' +
      '<span style="font-size:13.5px;font-weight:700;color:#B91C1C;">' + escapeHtmlPtb(cfg.rightWarning.headerText) + '</span></div>' +
      '<div style="display:flex;flex-direction:column;gap:8px;">' +
      cfg.rightWarning.items.map(function (it) { return execReportListRow(it.label, it.badge, '#DC2626'); }).join('') +
      '</div></div>';
  }

  var listHtml = '';
  if (cfg.rightListItems && cfg.rightListItems.length) {
    listHtml = '<div style="margin-top:' + (warningHtml ? '20px' : '0') + ';">' +
      '<div style="font-size:11px;font-weight:600;color:#9AA1A8;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:12px;">' + escapeHtmlPtb(cfg.rightListTitle) + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:11px;">' +
      cfg.rightListItems.map(function (it, idx) {
        var sep = idx > 0 ? '<div style="height:1px;background:#F1F3F2;"></div>' : '';
        return sep + execReportListRow(it.label, it.badge, it.badgeColor || '#63816F');
      }).join('') +
      '</div></div>';
  }

  var rightColHtml = (warningHtml + listHtml) || '<div style="font-size:12.5px;color:#9AA1A8;">ไม่มีรายการ</div>';
  var iconUrl = new URL('icons/icon-192.png', window.location.href).href; // แก้บั๊ก: เดิมเดา origin+'/icons/...' ผิด ถ้าแอป host ไม่ได้อยู่ที่ domain root โลโก้เลยหาย

  return '<!doctype html><html><head><meta charset="utf-8"><title>' + escapeHtmlPtb(cfg.periodLabel) + '</title>' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&display=swap">' +
    '<style>' +
      '@page { size: A4; margin: 0; }' +
      'body{margin:0;background:#F4F5F4;font-family:"Chakra Petch","Noto Sans Thai","Sarabun",sans-serif;color:#201E1D;}' +
      '*{box-sizing:border-box;}' +
      '.page{width:210mm;min-height:297mm;background:#fff;padding:16mm 15mm;margin:0 auto;position:relative;}' +
      '@media print{ body{background:#fff;} .page{margin:0;} }' +
    '</style></head><body>' +
    '<div class="page">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
        '<div style="display:flex;align-items:center;gap:10px;"><img src="' + iconUrl + '" alt="" style="height:32px;width:32px;border-radius:7px;">' +
        '<span style="font-size:15px;font-weight:700;color:#3F654D;">C2TECH</span></div>' +
        '<div style="text-align:right;font-size:11px;color:#63816F;letter-spacing:0.04em;">รายงานสรุปงาน</div>' +
      '</div>' +
      '<div style="margin-top:22px;display:flex;align-items:baseline;justify-content:space-between;">' +
        '<div><div style="font-size:28px;font-weight:700;line-height:1.15;">' + escapeHtmlPtb(cfg.periodLabel) + '</div>' +
        '<div style="margin-top:6px;font-size:13px;color:#63816F;">' + escapeHtmlPtb(cfg.dateRangeLabel) + '</div></div>' +
        '<div style="text-align:right;"><div style="font-size:32px;font-weight:700;color:#3F654D;line-height:1;">' + total + '</div>' +
        '<div style="font-size:11.5px;color:#63816F;margin-top:2px;">' + escapeHtmlPtb(cfg.totalLabel || 'งานทั้งหมด') + '</div></div>' +
      '</div>' +
      '<div style="height:1px;background:#D2DCD8;margin-top:20px;"></div>' +
      '<div style="display:flex;gap:40px;align-items:center;margin-top:28px;">' +
        '<div style="position:relative;width:200px;height:200px;flex-shrink:0;">' + donutSvg +
          '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">' +
            '<div style="font-size:42px;font-weight:700;color:#3F654D;line-height:1;">' + (cfg.donutCenterPct || 0) + '%</div>' +
            '<div style="font-size:12px;color:#63816F;margin-top:5px;">' + escapeHtmlPtb(cfg.donutCenterSub || '') + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="flex:1;display:flex;flex-direction:column;gap:17px;">' +
          '<div style="font-size:12px;font-weight:600;color:#9AA1A8;letter-spacing:0.08em;text-transform:uppercase;">' + escapeHtmlPtb(cfg.donutSectionTitle || 'สถานะงาน') + '</div>' +
          legendHtml +
        '</div>' +
      '</div>' +
      '<div style="height:1px;background:#D2DCD8;margin-top:30px;"></div>' +
      '<div style="display:flex;gap:26px;margin-top:24px;">' +
        '<div style="width:310px;flex-shrink:0;">' +
          '<div style="font-size:11px;font-weight:600;color:#9AA1A8;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:15px;">ภาระงานรายคน</div>' +
          '<div style="display:flex;flex-direction:column;gap:14px;">' + (workloadHtml || '<div style="font-size:12.5px;color:#9AA1A8;">ไม่มีข้อมูล</div>') + '</div>' +
        '</div>' +
        '<div style="flex:1;">' + rightColHtml + '</div>' +
      '</div>' +
      '<div style="position:absolute;left:15mm;right:15mm;bottom:12mm;display:flex;justify-content:space-between;font-size:10.5px;color:#9AA1A8;border-top:1px solid #EEF0EE;padding-top:10px;">' +
        '<span>C2TECH — C2 Calendar</span><span>สร้างรายงานเมื่อ ' + escapeHtmlPtb(cfg.generatedAtLabel) + '</span>' +
      '</div>' +
    '</div>' +
    '</body></html>';
}

function openExecReportInNewTab(html, preOpenedTab) {
  var w = preOpenedTab || window.open('', '_blank');
  if (!w) {
    Swal.fire({ icon: 'warning', title: 'เบราว์เซอร์บล็อกการเปิดแท็บใหม่', text: 'กรุณาอนุญาต pop-up สำหรับเว็บไซต์นี้แล้วลองอีกครั้ง' });
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  var triggered = false;
  function doPrint() { if (triggered) return; triggered = true; try { w.focus(); w.print(); } catch (e) {} }
  w.onload = doPrint;
  setTimeout(doPrint, 500); // เผื่อ onload ไม่ทำงาน/fire ไปแล้วก่อนตั้ง handler (มักเกิดกับเอกสารที่ document.write เอง) - ให้เวลาฟอนต์ Google Fonts โหลดด้วย
}

function fmtGeneratedAtLabel() {
  var d = new Date();
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
}

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
      'รายละเอียด': stripHtmlToText(row.detail || '')
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
  exportWorkbookViaNewTab(wb, 'C2Calendar_' + monthLabel.replace(/\s/g, '_') + '.xlsx');
  Toast.fire({ icon: 'success', title: 'Export สำเร็จ (' + rows.length + ' งาน)' });
}

function toggleCalendarViewMode() {
  if (!calendarInstance) return;
  // แก้ให้รองรับ view.type เป็น listDay/listWeek ได้ด้วย (ไม่ใช่แค่ listMonth เดิม) เพราะตอนนี้มุมมอง List
  // มีแถบสลับช่วงย่อยแล้ว (ดู setListRange) - เดิมเช็คแค่ 'listMonth' ตรงๆ ทำให้กดสลับตอนอยู่ listWeek/listDay
  // แล้วได้ 'listMonth' (list) ซ้ำแทนที่จะกลับไปมุมมองเดือนแบบตาราง (dayGridMonth) ตามที่ตั้งใจ
  var isCurrentlyList = calendarInstance.view.type.indexOf('list') === 0;
  var newView = isCurrentlyList ? 'dayGridMonth' : 'listMonth';
  calendarInstance.changeView(newView);
  localStorage.setItem(CALENDAR_VIEW_PREF_KEY, newView);
  updateViewToggleLabel(newView);
  // หมายเหตุ: ไม่ต้องเรียก reverseListViewDayOrder() ซ้ำตรงนี้ — changeView() ทำให้ eventsSet
  // ของปฏิทิน (ที่ผูก reverseListViewDayOrder ไว้แล้ว) ยิงเองอยู่แล้ว เรียกซ้ำจะกลายเป็นสลับ 2 ครั้ง
  // (สลับแล้วสลับกลับ) ทำให้ list กลับไปเรียงแบบเดิม (เก่า->ใหม่) เหมือนไม่ได้แก้อะไรเลย — นี่คือบั๊กที่พบ
}

// ===== สลับลำดับปฏิทินมุมมอง List ให้วันล่าสุดอยู่บนสุด =====
// FullCalendar (ปลั๊กอิน List) ไม่มีตัวเลือกให้เรียงจากใหม่ไปเก่าในตัว เรียงเก่า->ใหม่เสมอ
// ฟังก์ชันนี้จึงสลับตำแหน่งกลุ่ม "วัน" (tr.fc-list-day + แถวงานของวันนั้น) ใน DOM หลัง render เสร็จ
// โดยไม่แตะลำดับงานภายในวันเดียวกัน (เวลาเช้า->เย็นยังเรียงปกติ) และไม่ลบ/สร้าง element ใหม่
// (แค่ appendChild ย้ายตำแหน่ง) เพื่อไม่ให้ event listener ของ FullCalendar ที่ผูกกับแถวหลุด
function reverseListViewDayOrder() {
  if (!calendarInstance || calendarInstance.view.type.indexOf('list') !== 0) return;
  var calendarEl = document.getElementById('calendar');
  if (!calendarEl) return;
  var tbody = calendarEl.querySelector('.fc-list-table tbody');
  if (!tbody) return;

  var rows = Array.prototype.slice.call(tbody.children);
  var groups = [];
  var current = null;
  rows.forEach(function (row) {
    if (row.classList.contains('fc-list-day')) {
      current = [row];
      groups.push(current);
    } else if (current) {
      current.push(row);
    } else {
      // กันเคสแปลกที่มีแถวไม่มี day header นำหน้า (ไม่ควรเกิดกับโครงสร้างของ FullCalendar ปกติ)
      groups.push([row]);
    }
  });

  groups.reverse();
  var frag = document.createDocumentFragment();
  groups.forEach(function (g) {
    g.forEach(function (row) { frag.appendChild(row); });
  });
  tbody.appendChild(frag);
}

function updateViewToggleLabel(viewType) {
  var label = document.getElementById('mfn-view-toggle-label');
  if (!label) return;
  // เช็คด้วย indexOf('list') แทนการเทียบ 'listMonth' ตรงๆ ด้วยเหตุผลเดียวกับ toggleCalendarViewMode ด้านบน
  // (ตอนนี้มุมมอง List มีทั้ง listDay/listWeek/listMonth ไม่ใช่แค่ listMonth เดิม)
  label.textContent = viewType.indexOf('list') === 0 ? 'ดูเดือน' : 'ดูรายการ';
}

// ================================================================================
// ===== Phase: มุมมองปฏิทินมือถือ อ่านง่ายขึ้น (คุยกับผู้ใช้แล้วเลือกแนวทางนี้) ===================
// ================================================================================

// ===== แถบสลับช่วงของมุมมอง List (วันนี้/สัปดาห์นี้/เดือนนี้) — โชว์เฉพาะตอนอยู่มุมมอง List บนมือถือ
// (PC มีปุ่มสลับมุมมองจริงอยู่แล้วในแถบเครื่องมือด้านบน ไม่ต้องมีแถบซ้ำอีกชั้น) =====
function updateListRangeToggle(viewType) {
  var bar = document.getElementById('list-range-toggle');
  if (!bar) return;
  var show = isMobileView() && viewType.indexOf('list') === 0;
  bar.classList.toggle('show', show);
  if (!show) return;
  bar.querySelectorAll('button').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-range') === viewType);
  });
}

function setListRange(viewType) {
  if (!calendarInstance) return;
  calendarInstance.changeView(viewType);
  // จำไว้เป็นค่า pref เดียวกับปุ่มสลับหลัก (มุมมอง List/เดือน) เพื่อให้เปิดแอปครั้งถัดไปกลับมาที่ช่วงเดิม
  localStorage.setItem(CALENDAR_VIEW_PREF_KEY, viewType);
  updateViewToggleLabel(viewType);
}

// ===== เติมแถว "ไม่มีงาน" ให้วันที่ไม่มีงานเลยในมุมมอง List — เฉพาะ listDay/listWeek (ช่วงสั้น นับวันได้ไม่กี่วัน)
// ไม่ทำกับ listMonth เพราะอาจมีวันว่างเป็นสิบวันต่อเดือน จะรกเกินไป — FullCalendar เองไม่มีตัวเลือกให้โชว์
// วันว่างในมุมมอง List (ข้ามวันที่ไม่มี event ไปเลยโดยดีไซน์) จึงต้องแทรกแถวปลอมเข้าไปในตารางเองหลัง render
// เสร็จแล้ว (เรียกจาก eventsSet ต่อจาก reverseListViewDayOrder เสมอ เพื่อให้ทำงานกับลำดับที่ reverse แล้ว) =====
function fillEmptyListDays() {
  if (!calendarInstance) return;
  var view = calendarInstance.view;
  if (view.type !== 'listDay' && view.type !== 'listWeek') return;

  var calendarEl = document.getElementById('calendar');
  var tbody = calendarEl && calendarEl.querySelector('.fc-list-table tbody');
  if (!tbody) return;

  // ล้างแถวว่างเก่าที่แทรกไว้รอบก่อนหน้าออกก่อนเสมอ กันแทรกซ้ำซ้อนเวลา eventsSet ยิงซ้ำ (เปลี่ยนตัวกรอง ฯลฯ)
  tbody.querySelectorAll('.fc-list-day-empty').forEach(function (row) { row.remove(); });

  var existingDates = {};
  tbody.querySelectorAll('.fc-list-day').forEach(function (row) {
    var d = row.getAttribute('data-date');
    if (d) existingDates[d] = true;
  });

  var WEEKDAY_TH = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  var MONTH_TH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

  // currentEnd เป็น exclusive (มาตรฐาน FullCalendar) จึงวนแค่ < currentEnd ไม่รวมวันนั้น
  var cursor = new Date(view.currentStart.getFullYear(), view.currentStart.getMonth(), view.currentStart.getDate());
  var endDate = view.currentEnd;
  var missingRows = [];
  while (cursor < endDate) {
    var dateStr = cursor.getFullYear() + '-' + String(cursor.getMonth() + 1).padStart(2, '0') + '-' + String(cursor.getDate()).padStart(2, '0');
    if (!existingDates[dateStr]) {
      var headRow = document.createElement('tr');
      headRow.className = 'fc-list-day fc-list-day-empty';
      headRow.setAttribute('data-date', dateStr);
      var isToday = new Date().toDateString() === cursor.toDateString();
      headRow.innerHTML = '<th colspan="3"><div class="fc-list-day-cushion">' +
        '<span>' + WEEKDAY_TH[cursor.getDay()] + ' ' + cursor.getDate() + ' ' + MONTH_TH_SHORT[cursor.getMonth()] +
        (isToday ? ' · วันนี้' : '') + '</span></div></th>';
      var emptyRow = document.createElement('tr');
      emptyRow.className = 'fc-list-day-empty';
      emptyRow.innerHTML = '<td colspan="3">ไม่มีงาน</td>';
      missingRows.push({ date: dateStr, rows: [headRow, emptyRow] });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  if (missingRows.length === 0) return;

  // จัดกลุ่มแถวที่มีอยู่แล้ว (จริง) ตาม data-date เดิม เพื่อเอาไปเรียงรวมกับแถววันว่างที่สร้างใหม่
  var existingGroups = [];
  var current = null;
  Array.prototype.slice.call(tbody.children).forEach(function (row) {
    if (row.classList.contains('fc-list-day')) {
      current = { date: row.getAttribute('data-date'), rows: [row] };
      existingGroups.push(current);
    } else if (current) {
      current.rows.push(row);
    }
  });

  var allGroups = existingGroups.concat(missingRows);
  // เรียงใหม่-ไปเก่า ให้ตรงกับพฤติกรรม reverseListViewDayOrder ที่ทำกับแถวจริงไปแล้วก่อนหน้านี้
  allGroups.sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });

  var frag = document.createDocumentFragment();
  allGroups.forEach(function (g) { g.rows.forEach(function (row) { frag.appendChild(row); }); });
  tbody.appendChild(frag);
}

// ===== Bottom sheet "+N เพิ่มเติม" ของมุมมองเดือนบนมือถือ (แนวทาง 1) =====
var TASK_TYPE_DOT_COLOR = { meeting: '#FCE38A', onsite: '#FFB48A', event: '#C9A6FF', leave: '#E5E7EB' };
function openDaySheet(date, events) {
  var overlay = document.getElementById('day-sheet-overlay');
  var titleEl = document.getElementById('day-sheet-title');
  var listEl = document.getElementById('day-sheet-list');
  if (!overlay || !titleEl || !listEl) return;

  var WEEKDAY_TH = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  var MONTH_TH_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  titleEl.textContent = 'วัน' + WEEKDAY_TH[date.getDay()] + ' ' + date.getDate() + ' ' + MONTH_TH_FULL[date.getMonth()] +
    ' ' + (date.getFullYear() + 543) + ' · ' + events.length + ' งาน';

  var sorted = events.slice().sort(function (a, b) {
    var ta = a.start ? a.start.getTime() : 0, tb = b.start ? b.start.getTime() : 0;
    return ta - tb;
  });

  if (sorted.length === 0) {
    listEl.innerHTML = '<div class="day-sheet-empty">ไม่มีงาน</div>';
  } else {
    listEl.innerHTML = sorted.map(function (ev, idx) {
      var timeText = (!ev.allDay && ev.start) ? ev.start.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : 'ทั้งวัน';
      var dotColor = TASK_TYPE_DOT_COLOR[ev.extendedProps.taskType] || '#ccc';
      return '<div class="day-sheet-item" data-idx="' + idx + '">' +
        '<span class="ds-time">' + timeText + '</span>' +
        '<span class="ds-dot" style="background:' + dotColor + '"></span>' +
        '<span class="ds-title">' + escapeHtmlPtb(ev.title) + '</span>' +
        '</div>';
    }).join('');
    Array.prototype.slice.call(listEl.querySelectorAll('.day-sheet-item')).forEach(function (row, idx) {
      row.addEventListener('click', function () {
        closeDaySheet();
        openTaskDetailModal(sorted[idx]);
      });
    });
  }

  overlay.classList.add('show');
}
function closeDaySheet() {
  var overlay = document.getElementById('day-sheet-overlay');
  if (overlay) overlay.classList.remove('show');
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
  _pushModalNav('dashboard-modal-overlay');
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

  // เก็บไว้ใช้ตอนพิมพ์รายงาน (curByType เพิ่มมาให้รายงานสรุป exec ใช้ทำโดนัทสัดส่วนประเภทงาน)
  window._dashboardPrintData = { ranges: ranges, curTasks: curTasks, workload: workload, sorted: sorted, curByType: curByType };
}

// ===== พิมพ์รายงาน (เปิด print dialog ของเบราว์เซอร์ ให้ Save เป็น PDF ได้เอง) =====

function printDashboardReport() {
  var d = window._dashboardPrintData;
  if (!d) return;

  // โดนัทสัดส่วนประเภทงาน (ปฏิทินหลักไม่มีสถานะ เสร็จแล้ว/กำลังทำ/ต้องทำ แบบ Personal Task Board มีแต่ประเภทงาน
  // meeting/onsite/event/leave จึงใช้ตัวนี้แทนเป็นแกนโดนัทของรายงาน Dashboard)
  var typeKeys = ['meeting', 'onsite', 'event', 'leave'];
  var donutSegments = typeKeys.map(function (t) {
    return { label: (TASK_TYPE_LABELS[t] || t).replace(/\s*\(.*\)/, ''), count: (d.curByType && d.curByType[t]) || 0, color: getTaskTypeColor(t) };
  }).filter(function (seg) { return seg.count > 0; }); // ไม่โชว์ประเภทที่ไม่มีงานเลยกันโดนัทรก
  if (donutSegments.length === 0) donutSegments = [{ label: 'ไม่มีงาน', count: 0, color: '#E5E7EB' }];
  var donutTotal = donutSegments.reduce(function (s, x) { return s + x.count; }, 0);
  var topSeg = donutSegments.reduce(function (a, b) { return b.count > a.count ? b : a; }, donutSegments[0]);

  var workload = d.sorted.map(function (id) {
    var s = staffMapCache[id];
    return { name: s ? (s.firstName + ' ' + s.lastName) : id, count: d.workload[id], color: s ? s.colorHex : '#9AA1A8' };
  }).slice(0, 8);

  // งานที่ใกล้ถึงเร็วๆ นี้ในช่วงที่เลือก - ปฏิทินหลักเป็นกำหนดการ ไม่ใช่ deadline จึงไม่มีแนวคิด "เกินกำหนด"
  // แบบ Task Board โชว์เป็น "กำหนดการที่จะถึง" แทนกล่องเตือนสีแดง
  var now = new Date();
  var upcoming = d.curTasks.slice().filter(function (t) { return t.start >= now; })
    .sort(function (a, b) { return a.start - b.start; }).slice(0, 6)
    .map(function (t) {
      return { label: t.data.taskName, badge: t.start.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }), badgeColor: '#63816F' };
    });

  var html = execReportHtml({
    periodLabel: 'Dashboard — ' + d.ranges.label,
    dateRangeLabel: d.ranges.label,
    totalLabel: 'งานทั้งหมด',
    donutSegments: donutSegments,
    donutSectionTitle: 'สัดส่วนประเภทงาน',
    donutCenterPct: donutTotal > 0 ? Math.round(topSeg.count / donutTotal * 100) : 0,
    donutCenterSub: topSeg.label,
    workload: workload,
    rightWarning: null,
    rightListTitle: 'กำหนดการที่จะถึง',
    rightListItems: upcoming,
    generatedAtLabel: fmtGeneratedAtLabel()
  });

  // สร้างและพิมพ์จากแท็บใหม่แทน window.print() ในเฟรมเดิม (ดูเหตุผลที่ exportWorkbookViaNewTab ด้านบน) -
  // ฟังก์ชันนี้ไม่มีการรอ API ก่อน จึงยังเปิดแท็บใหม่ได้ตรงๆ แบบ synchronous จาก click ปุ่ม
  openExecReportInNewTab(html);
}

function openMoreMenu() {
  closeAllDrawers();
  var role = localStorage.getItem(ROLE_KEY);
  var name = localStorage.getItem(NAME_KEY);
  var container = document.getElementById('more-menu-list');
  var nameEl = document.getElementById('more-menu-name');
  var refreshBtn = '<button onclick="closeMoreMenu(); mobileRefreshFromMenu();">🔄 รีเฟรชข้อมูล</button>';
  // ไม่ปิดเมนูตอนกด เพื่อให้กดสลับดูผลไปเรื่อยๆ ได้เลยโดยไม่ต้องเปิดเมนูใหม่ทุกครั้ง - เรียก openMoreMenu()
  // ซ้ำหลัง cycleTheme() เพื่อ re-render label/ไอคอนในเมนูให้ตรงกับสถานะใหม่ทันที (เมนูยังเปิดค้างอยู่)
  var themeBtn = '<button onclick="cycleTheme(); openMoreMenu();">' + getThemeMenuLabel() + '</button>';

  if (!localStorage.getItem(TOKEN_KEY)) {
    nameEl.textContent = 'ยังไม่ได้เข้าสู่ระบบ';
    container.innerHTML = refreshBtn + themeBtn + '<button onclick="closeMoreMenu(); openLoginModal();">เข้าสู่ระบบ</button>';
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
    container.innerHTML = refreshBtn + themeBtn + items.map(function (it) {
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
    title: 'ส่งคำขอลบงานนี้?',
    input: 'text', inputPlaceholder: 'เหตุผล (ไม่บังคับ)',
    html: '<div class="td-warning-banner" style="text-align:left;justify-content:flex-start">⚠️ Admin จะต้องอนุมัติก่อนงานถึงจะถูกลบจริง</div>',
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

// ===== Modal ดูรายละเอียดงาน (กดที่งานในปฏิทิน) =====
function closeTaskDetailModal() {
  document.getElementById('task-detail-modal-overlay').style.display = 'none';
}

function openTaskDetailModal(event) {
  var props = event.extendedProps;
  var taskId = event.id;

  document.getElementById('td-title').textContent = event.title;
  document.getElementById('td-type').textContent = TASK_TYPE_LABELS[props.taskType] || props.taskType;
  document.getElementById('td-date').textContent = formatEventDateRange(event);
  document.getElementById('td-location').textContent = props.location || '-';
  var tdDetailPlain = stripHtmlToText(props.detail || '');
  document.getElementById('td-detail').innerHTML = tdDetailPlain ? sanitizeRichText(props.detail) : '-';

  var warningEl = document.getElementById('td-warning-banner');
  warningEl.style.display = 'none';

  var staffCard = document.getElementById('td-staff-card');
  staffCard.innerHTML = '';
  var staffList = props.staff || [];
  if (!staffList.length) {
    staffCard.innerHTML = '<span style="font-size:13px;color:#6b7280">-</span>';
  } else {
    staffList.forEach(function (s) {
      var item = document.createElement('div');
      item.className = 'td-staff-item';
      var dot = document.createElement('span');
      dot.className = 'td-staff-dot';
      dot.style.background = s.color;
      item.appendChild(dot);
      item.appendChild(document.createTextNode(s.name));
      staffCard.appendChild(item);
    });
  }

  var actionsEl = document.getElementById('td-actions');
  actionsEl.innerHTML = '';

  function addBtn(label, cls, onClick) {
    var btn = document.createElement('button');
    btn.className = cls;
    btn.textContent = label;
    btn.onclick = onClick;
    actionsEl.appendChild(btn);
  }

  var token = localStorage.getItem(TOKEN_KEY);
  var myRole = localStorage.getItem(ROLE_KEY);
  var myAccountId = localStorage.getItem(ACCOUNT_ID_KEY);

  if (!token) {
    addBtn('ปิด', 'td-btn-plain', closeTaskDetailModal);
  } else if (myRole === 'admin' || myRole === 'ceo') {
    addBtn('ปิด', 'td-btn-plain', closeTaskDetailModal);
    addBtn('ลบงาน', 'td-btn-danger', function () { closeTaskDetailModal(); deleteTaskConfirm(taskId); });
    addBtn('แก้ไข', 'td-btn-primary', function () { closeTaskDetailModal(); openTaskModalForEdit(taskId); });
  } else {
    var isOwner = props.createdBy === myAccountId || (props.staffIds || []).indexOf(myAccountId) !== -1;
    addBtn('ปิด', 'td-btn-plain', closeTaskDetailModal);
    if (isOwner) {
      addBtn('ขอลบงาน', 'td-btn-danger', function () { closeTaskDetailModal(); requestDeleteTaskConfirm(taskId); });
      addBtn('ขอเปลี่ยนวัน', 'td-btn-primary', function () { closeTaskDetailModal(); openRescheduleModal(taskId); });
    }
  }

  document.getElementById('task-detail-modal-overlay').style.display = 'flex';
  _pushModalNav('task-detail-modal-overlay');
}

// ===== Staff: ขอเปลี่ยนวัน =====
var rescheduleTaskId = null;

function openRescheduleModal(taskId) {
  rescheduleTaskId = taskId;
  document.getElementById('reschedule-start-date').value = '';
  document.getElementById('reschedule-end-date').value = '';
  document.getElementById('reschedule-reason').value = '';
  document.getElementById('reschedule-modal-overlay').style.display = 'flex';
  _pushModalNav('reschedule-modal-overlay');
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

    // คลิกที่การ์ด: ถ้ายังไม่อ่านให้ทำเครื่องหมายอ่านแล้วเหมือนเดิม และถ้ามีงานผูกอยู่ (taskId ของปฏิทินหลัก
    // หรือ personalTaskId ของ Personal Task Board) ให้เปิดการ์ดรายละเอียดงานซ้อนขึ้นมาเลยโดยไม่ปิดลิสต์นี้ก่อน
    // (changeRequestNew ยังคงใช้ปุ่มอนุมัติ/ไม่อนุมัติเหมือนเดิม ไม่ต้องเปิดการ์ดงาน)
    var hasLinkedTask = n.type !== 'changeRequestNew' && (n.taskId || n.personalTaskId);
    var clickable = n.type !== 'changeRequestNew' && (!n.read || hasLinkedTask);
    if (clickable) {
      card.style.cursor = 'pointer';
      card.onclick = function () {
        if (!n.read) markNotificationReadAndRefresh(n.id);
        if (n.personalTaskId) {
          openPersonalTaskModal(n.personalTaskId);
        } else if (n.taskId) {
          openTaskFromNotification(n.taskId);
        }
      };
    }
    container.appendChild(card);
  });
}

// ===== เปิดการ์ดรายละเอียดงาน (ปฏิทินหลัก) จากการแจ้งเตือน - ซ้อนขึ้นมาโดยไม่ปิดลิสต์แจ้งเตือน =====
// ใช้ calendarInstance.getEventById แทนการยิง API ใหม่ เพราะ events ทั้งหมดโหลดแบบ real-time listener
// (ไม่จำกัดช่วงวันที่) อยู่แล้วใน lastRenderedEvents ตั้งแต่เปิดหน้าเว็บ
function openTaskFromNotification(taskId) {
  var ev = calendarInstance && calendarInstance.getEventById ? calendarInstance.getEventById(taskId) : null;
  if (ev) {
    openTaskDetailModal(ev);
  } else {
    Swal.fire({ icon: 'info', title: 'ไม่พบงานนี้แล้ว', text: 'งานอาจถูกลบหรือยกเลิกไปแล้ว' });
  }
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

/** ปุ่ม "อ่านทั้งหมด" ในเมนูแจ้งเตือน — ยิง markNotificationRead พร้อมกันทีละหลายรายการสำหรับทุกรายการที่ยังไม่ได้อ่าน
 * (ไม่รวมรายการ changeRequestNew ที่ยังไม่ได้กดอนุมัติ/ไม่อนุมัติ เพราะการันตีว่า Admin ยังต้องเปิดมาดำเนินการอยู่ดี) */
function markAllNotificationsRead(btn) {
  var token = localStorage.getItem(TOKEN_KEY);
  var unread = lastNotifications.filter(function (n) { return !n.read && n.type !== 'changeRequestNew'; });
  if (unread.length === 0) {
    Toast.fire({ icon: 'info', title: 'อ่านหมดแล้ว' });
    return;
  }
  var originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'กำลังทำเครื่องหมาย...';
  Promise.all(unread.map(function (n) {
    return callApi('markNotificationRead', { token: token, notificationId: n.id }).then(function () {
      n.read = true;
    });
  })).then(function () {
    renderNotificationsList();
    Toast.fire({ icon: 'success', title: 'อ่านทั้งหมดแล้ว' });
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'ทำเครื่องหมายไม่สำเร็จบางรายการ', text: err.message });
    renderNotificationsList();
  }).finally(function () {
    btn.disabled = false;
    btn.textContent = originalText;
  });
}

function openMyRequestsModal() {
  document.getElementById('my-requests-modal-overlay').style.display = 'flex';
  renderNotificationsList();
  _pushModalNav('my-requests-modal-overlay');
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
      // Phase: เพิ่มมุมมอง "รายปี" (multiMonthYear) ต่อจากเดือน/สัปดาห์/วันเดิม — เฉพาะจอเดสก์ท็อป/แท็บเล็ต
      // เท่านั้น จอมือถือแคบเกินจะอ่าน 12 เดือนพร้อมกันจึงไม่เพิ่มปุ่มนี้ในโหมดมือถือ
      : { left: 'prev,next today', center: 'title', right: 'multiMonthYear,dayGridMonth,timeGridWeek,timeGridDay' },
    locale: 'th',
    height: 'auto',
    eventDisplay: 'block',
    allDayText: 'ทั้งวัน',
    buttonText: { today: 'วันนี้', year: 'year' },
    // ข้อความ "No events to display" เริ่มต้นของปลั๊กอิน List เป็นภาษาอังกฤษ ล้วนโผล่เฉพาะตอนทั้งสัปดาห์/วัน
    // ที่เลือกดูไม่มีงานเลยสักอันเดียว (FullCalendar ไม่สร้าง <table> แถวรายวันมาให้ fillEmptyListDays()
    // เติมแถวว่างต่อจึงต้องอาศัยข้อความนี้แทนในเคสนี้โดยเฉพาะ)
    noEventsText: 'ไม่มีงานในช่วงนี้',
    events: result.events,
    // Phase: ลดความแน่นของมุมมองเดือน (แนวทาง 1 จาก preview ที่คุยกับผู้ใช้) — โชว์งานเต็มคำแค่ 3 อันแรก
    // ต่อวัน ที่เหลือยุบเป็น "+N เพิ่มเติม" กดแล้วเปิด bottom sheet ของเราเอง (มือถือ) แทน popover
    // ค้างจอแคบเดิมของ FullCalendar - ใช้เลข 3 คงที่ทั้ง PC/มือถือให้พฤติกรรมสม่ำเสมอ ไม่มีโหมดพิเศษแยก
    dayMaxEvents: 3,
    moreLinkClick: function (info) {
      if (!isMobileView()) return 'popover'; // จอกว้างพอ ใช้ popover เริ่มต้นของ FullCalendar ตามเดิม
      var evs = (info.allSegs || [])
        .map(function (seg) { return seg.event; })
        .filter(function (ev) { return !ev.extendedProps.isHoliday; });
      openDaySheet(info.date, evs);
      return 'none'; // กันไม่ให้ FullCalendar เปิด popover ซ้อนทับ sheet ของเราอีกชั้น
    },
    // Phase: การ์ดประเภทงาน (ไซด์บาร์ขวา) กดกรองปฏิทินได้ — ใส่ class ให้งานที่ไม่ตรงกับตัวกรองที่เลือกอยู่
    // แล้วซ่อนด้วย CSS (.fc-type-filtered) ดู setTaskTypeFilter() ที่เรียก calendarInstance.render() เพื่อให้
    // callback นี้ถูกประเมินใหม่ทุกครั้งที่เปลี่ยนตัวกรอง (ไม่กระทบ event ของจริงที่โหลดมา แค่ซ่อน/โชว์ด้วย CSS)
    eventClassNames: function (arg) {
      if (arg.event.extendedProps.isHoliday) return [];
      if (!activeTaskTypeFilter) return [];
      return arg.event.extendedProps.taskType === activeTaskTypeFilter ? [] : ['fc-type-filtered'];
    },
    datesSet: function (arg) {
      // มุมมองรายปี (multiMonthYear) ช่วงวันที่ครอบคลุมทั้งปี ไม่ใช่แค่เดือนเดียว — ถ้าเอาไปอัปเดตแผง
      // "📅 วันหยุดเดือนนี้" ตรงๆ จะกลายเป็นโชว์วันหยุดทั้งปีทั้งที่หัวข้อบอกว่า "เดือนนี้" ทำให้เข้าใจผิด
      // จึงข้ามไปเลยตอนอยู่มุมมองรายปี ปล่อยให้แผงคงค่าจากเดือนล่าสุดที่เคยดูไว้แทน
      if (arg.view.type === 'multiMonthYear') return;
      renderMonthHolidayList(arg.view.currentStart, arg.view.currentEnd);
      // แถบสลับช่วง "วันนี้/สัปดาห์นี้/เดือนนี้" ของมุมมอง List (มือถือ) - โชว์เฉพาะตอนอยู่มุมมอง List
      // และไฮไลต์ปุ่มที่ตรงกับ view.type ปัจจุบัน ต้องเรียกตรงนี้ (ไม่ใช่ eventsSet) เพราะเปลี่ยนมุมมองแล้ว
      // แม้ยังไม่มี event ใหม่มาก็ต้องอัปเดตทันที
      updateListRangeToggle(arg.view.type);
    },
    eventsSet: function () {
      // ยิงทุกครั้งที่ FullCalendar render เนื้อหาชุดใหม่เสร็จ (เปลี่ยนเดือน/เพิ่ม-แก้-ลบงาน/โหลดครั้งแรก)
      // ใช้จุดนี้เรียง list view ใหม่ให้วันล่าสุดอยู่บนสุด แทนที่จะเรียงเก่า->ใหม่ตามค่าเริ่มต้นของไลบรารี
      reverseListViewDayOrder();
      // Phase: เติมแถว "ไม่มีงาน" ให้วันว่างในมุมมอง List ช่วงสั้น (วันนี้/สัปดาห์นี้) ต้องรันหลัง
      // reverseListViewDayOrder เสมอ เพราะฟังก์ชันนี้อ้างอิงลำดับ/กลุ่มแถวที่ reverse แล้วเป็นฐาน
      fillEmptyListDays();
      // จุดเดียวกันนี้ครอบคลุมทั้งเปลี่ยนเดือนและข้อมูลอัปเดต จึงใช้อัปเดตตัวเลขท้ายชื่อประเภทงาน
      // ในไซด์บาร์ขวาด้วย ให้ตรงกับช่วงเดือน/มุมมองที่กำลังดูอยู่เสมอ
      updateLegendCounts();
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
      // มุมมองรายปีเซลล์เล็กมาก ใส่แค่ไฮไลต์สีพอ ไม่ใส่ป้ายชื่อวันหยุดตัวหนังสือ (ล้นเซลล์แน่นอน)
      if (arg.view.type === 'multiMonthYear') return;
      var label = document.createElement('div');
      label.className = 'holiday-cell-label';
      label.textContent = matched.map(function (h) { return h.name; }).join(', ');
      frame.appendChild(label);
    },
    eventContent: function (arg) {
      if (arg.event.extendedProps.isHoliday) return true;
      // มุมมองรายปี เซลล์เล็กมาก ปล่อยให้ FullCalendar ใช้การ์ดเหตุการณ์แบบมาตรฐาน (จุดสี+ชื่อย่อ) แทน
      // เลย์เอาต์แถวไอคอน/เวลาที่ปรับเองด้านล่างนี้ ซึ่งออกแบบมาสำหรับเซลล์เดือน/สัปดาห์/วันที่ใหญ่กว่า
      if (arg.view.type === 'multiMonthYear') return true;
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
      // มุมมอง List: จุดสี/เวลาอยู่ชิดขอบบนของบรรทัดแรกเท่านั้น (ไม่ center ทั้งแนวตั้ง) เพราะชื่องาน
      // อาจขึ้นหลายบรรทัดแล้ว (แก้บั๊กชื่องานยาวดันจอมือถือล้น - เปลี่ยนจากตัดจบ "..." เป็นขึ้นบรรทัดใหม่แทน)
      topRow.style.alignItems = isListView ? 'flex-start' : 'center';
      topRow.style.gap = '3px';
      topRow.style.overflow = 'hidden';
      topRow.style.width = '100%';
      topRow.style.minWidth = '0';
      topRow.innerHTML = timeHtml + dotsHtml;

      var titleSpan = document.createElement('span');
      titleSpan.style.minWidth = '0';
      titleSpan.style.flex = '1';
      if (isListView) {
        // List view: ให้ขึ้นบรรทัดใหม่แทนการตัดจบด้วย "..." (ผู้ใช้เลือกแบบนี้ - เห็นชื่องานเต็มเสมอ)
        titleSpan.style.whiteSpace = 'normal';
        titleSpan.style.wordBreak = 'break-word';
        titleSpan.style.fontWeight = '600';
      } else {
        // มุมมอง Grid (เดือน/สัปดาห์/วัน) เซลล์เตี้ย ยังต้องตัดจบบรรทัดเดียวเหมือนเดิม
        titleSpan.style.overflow = 'hidden';
        titleSpan.style.textOverflow = 'ellipsis';
        titleSpan.style.whiteSpace = 'nowrap';
      }
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
      openTaskDetailModal(info.event);
    }
  });
  calendarInstance.render();
  updateViewToggleLabel(initialViewToUse);
  hidePageLoading();
}

// ================================================================================
// ===== Personal Task Board (ptb/ptm) — ระบบจัดการ Task รายบุคคล ================
// ================================================================================
// แยกจาก collection "tasks" เดิม (= Event ปฏิทิน) และแยกจาก To-Do List (kanban ตาม
// ประเภทงานของ Event ที่ยังไม่ระบุวันที่) โดยสิ้นเชิง — นี่คือบอร์ด Kanban ส่วนบุคคลใหม่
// ต้อง login ก่อนถึงจะใช้ได้ (personalTasks ไม่ public เหมือน tasks/holidays)

var _personalTasksCache = [];
var _taskTagsCache = [];
var _ptbCurrentPersonId = null;
var _ptmEditingTaskId = null;
var _unsubPersonalTasks = null;
var _unsubTaskTags = null;
// ไฟล์ที่ผู้ใช้เลือกแนบไว้ตอนกำลัง "เพิ่ม Task ใหม่" (ยังไม่มี taskId จริง เลยอัปโหลดขึ้น Storage ไม่ได้ทันที
// เพราะ Storage Rules เช็ค assigneeIds ของ Task ที่มีอยู่จริงในฐานข้อมูล) - พักไว้ในนี้ก่อน แล้วอัปโหลดจริง
// ทันทีหลังบันทึก Task สำเร็จใน savePersonalTaskModal() ผู้ใช้เลยทำ "เพิ่ม Task + แนบไฟล์" ในขั้นตอนเดียวได้
// โดยไม่ต้องปิด-เปิด modal ใหม่มาแนบทีหลัง (ลบออกจาก array ด้วย ptmRemovePendingFile ได้ก่อนบันทึกจริง)
var _ptmPendingFiles = [];

function setupPersonalTasksListener() {
  if (_unsubPersonalTasks) return; // กันสมัครซ้ำถ้าเรียกซ้อน

  _unsubPersonalTasks = fbDb.collection('personalTasks').onSnapshot(function (snapshot) {
    _personalTasksCache = snapshot.docs.map(function (doc) {
      var d = doc.data();
      return {
        taskId: doc.id,
        title: d.title,
        description: d.description || '',
        status: d.status,
        priority: d.priority,
        tag: d.tag || '',
        dueDate: d.dueDate ? firestoreDateToJs(d.dueDate) : null,
        linkedEventId: d.linkedEventId || null,
        assigneeIds: d.assigneeIds || [],
        checklist: d.checklist || [],
        attachments: d.attachments || [],
        createdBy: d.createdBy
      };
    });
    updatePtbSummaryCard();
    if (document.getElementById('task-board-modal-overlay').style.display === 'flex') {
      refreshCurrentPtbView();
    }
  }, function (err) {
    console.error('personalTasks listener error', err);
  });

  _unsubTaskTags = fbDb.collection('taskTags').onSnapshot(function (snapshot) {
    _taskTagsCache = snapshot.docs.map(function (doc) { return doc.id; });
  }, function (err) {
    console.error('taskTags listener error', err);
  });
}

function teardownPersonalTasksListener() {
  if (_unsubPersonalTasks) { _unsubPersonalTasks(); _unsubPersonalTasks = null; }
  if (_unsubTaskTags) { _unsubTaskTags(); _unsubTaskTags = null; }
  _personalTasksCache = [];
  _taskTagsCache = [];
}

function updatePtbSummaryCard() {
  var myId = localStorage.getItem(ACCOUNT_ID_KEY);
  var mine = _personalTasksCache.filter(function (t) {
    return t.assigneeIds.indexOf(myId) !== -1 && t.status !== 'done';
  });
  var el = document.getElementById('ptb-summary-count');
  if (el) el.textContent = mine.length === 0 ? 'ไม่มีงานค้าง' : mine.length + ' งานที่ต้องทำ';
}

function isPtbOverdue(t) {
  return t.status !== 'done' && t.dueDate && t.dueDate.getTime() < Date.now();
}

function fmtPtbDate(d) {
  if (!d || isNaN(d.getTime())) return '-'; // กันเผื่อ d เป็น Date object ที่ invalid หลุดมาจากที่อื่น
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

function ptbStaffInitial(staffId) {
  var s = staffMapCache[staffId];
  return s ? (s.firstName || '?').charAt(0) : '?';
}
function ptbStaffColor(staffId) {
  var s = staffMapCache[staffId];
  return s ? (s.colorHex || '#888780') : '#888780';
}
function ptbStaffName(staffId) {
  var s = staffMapCache[staffId];
  return s ? (s.firstName + (s.lastName ? ' ' + s.lastName : '')) : 'ไม่ทราบชื่อ';
}

function openTaskBoardModal() {
  // เปิดให้ทุก role ที่ login แล้วเห็นแท็บ "ภาพรวมทั้งบริษัท" เหมือนกันหมด (เดิมซ่อนไว้เฉพาะ Admin/CEO)
  // ผู้ใช้ยืนยันแล้วว่าต้องการให้ทุกคน "ดู" ภาพรวม/บอร์ดรายคนได้ เพื่อช่วยกัน manage งาน แต่การแก้ไข/ลบ/
  // เปลี่ยนสถานะงานของคนอื่นยังจำกัดสิทธิ์เหมือนเดิม (คุมที่ canManagePersonalTask ฝั่ง Cloud Function)
  document.getElementById('ptb-tabs').style.display = 'flex';
  switchTaskBoardView('mystaff');
  document.getElementById('task-board-modal-overlay').style.display = 'flex';
  _pushModalNav('task-board-modal-overlay');
}
function closeTaskBoardModal() {
  document.getElementById('task-board-modal-overlay').style.display = 'none';
}

function switchTaskBoardView(view) {
  document.querySelectorAll('.ptb-view').forEach(function (v) { v.classList.remove('active'); });
  document.querySelectorAll('.ptb-tab').forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-view') === view); });

  if (view === 'mystaff') {
    document.getElementById('ptb-view-mystaff').classList.add('active');
    document.getElementById('ptb-modal-title').textContent = '📋 Task ของฉัน';
    renderPtbBoard('ptb-board-mystaff', localStorage.getItem(ACCOUNT_ID_KEY));
  } else if (view === 'admin') {
    document.getElementById('ptb-view-admin').classList.add('active');
    document.getElementById('ptb-modal-title').textContent = '📋 Task Board — ภาพรวมทั้งบริษัท';
    var adminTabBtn = document.querySelector('.ptb-tab[data-view="admin"]');
    if (adminTabBtn) adminTabBtn.classList.add('active');
    // ปุ่ม Export รายงานยังจำกัดเฉพาะ Admin/CEO เหมือนเดิม (ต่างจากตัวภาพรวมที่เปิดให้ทุกคนดูได้แล้ว)
    // ซ่อนไว้สำหรับ staff ทั่วไป กันกดแล้วเจอ error จาก Cloud Function โดยไม่จำเป็น
    var role = localStorage.getItem(ROLE_KEY);
    var isAdminOrCeo = role === 'admin' || role === 'ceo';
    var exportBtn = document.getElementById('ptb-export-btn');
    if (exportBtn) exportBtn.style.display = isAdminOrCeo ? 'inline-block' : 'none';
    renderPtbAdminOverview();
  } else if (view === 'person') {
    document.getElementById('ptb-view-person').classList.add('active');
    document.getElementById('ptb-modal-title').textContent = '📋 Task Board';
  }
}

function refreshCurrentPtbView() {
  var active = document.querySelector('.ptb-view.active');
  if (!active) return;
  if (active.id === 'ptb-view-mystaff') renderPtbBoard('ptb-board-mystaff', localStorage.getItem(ACCOUNT_ID_KEY));
  else if (active.id === 'ptb-view-admin') renderPtbAdminOverview();
  else if (active.id === 'ptb-view-person' && _ptbCurrentPersonId) renderPtbBoard('ptb-board-person', _ptbCurrentPersonId);
}

var PTB_COLS = [
  { key: 'todo', label: 'สิ่งที่ต้องทำ', color: '#dfe3e6' },
  { key: 'doing', label: 'กำลังทำ', color: '#fbbf24' },
  { key: 'done', label: 'เสร็จแล้ว', color: '#059669' }
];

// ===== เรียงลำดับการ์ดในบอร์ด: ค่าเริ่มต้น (ไม่เรียง) / วันครบกำหนดเก่า→ใหม่ / ความสำคัญสูง→ต่ำ =====
// ใช้ร่วมกันทั้งบอร์ด "งานของฉัน" และ "บอร์ดรายคน" (คุมด้วย select เดียวกันในแต่ละหน้า ซิงก์ค่ากันผ่าน
// applyPtbSortModeToSelects() กันเปิดคนละมุมมองแล้วค่า dropdown ไม่ตรงกับที่เลือกไว้จริง)
var _ptbSortMode = '';
var PTB_PRIORITY_RANK = { high: 3, medium: 2, low: 1 };
function setPtbSortMode(mode) {
  _ptbSortMode = mode;
  applyPtbSortModeToSelects();
  refreshCurrentPtbView();
}
function applyPtbSortModeToSelects() {
  ['ptb-sort-select-mystaff', 'ptb-sort-select-person'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = _ptbSortMode;
  });
}
function sortPtbTaskList(list) {
  if (_ptbSortMode === 'date_asc') {
    return list.slice().sort(function (a, b) {
      var da = a.dueDate ? a.dueDate.getTime() : Infinity; // ไม่มีวันครบกำหนด ไปอยู่ท้ายสุด
      var db = b.dueDate ? b.dueDate.getTime() : Infinity;
      return da - db;
    });
  }
  if (_ptbSortMode === 'priority_desc') {
    return list.slice().sort(function (a, b) {
      return (PTB_PRIORITY_RANK[b.priority] || 2) - (PTB_PRIORITY_RANK[a.priority] || 2);
    });
  }
  // ค่าเริ่มต้น (ผู้ใช้ยืนยันแล้ว): เรียงวันครบกำหนดเก่า→ใหม่ก่อนเป็นหลัก แล้วถ้าวันตรงกัน (หรือไม่มี
  // วันครบกำหนดทั้งคู่) ใช้ความสำคัญสูง→ต่ำตัดสินลำดับรอง ให้เห็นงานด่วน+สำคัญขึ้นก่อนเสมอโดยไม่ต้องเลือกเอง
  return list.slice().sort(function (a, b) {
    var da = a.dueDate ? a.dueDate.getTime() : Infinity;
    var db = b.dueDate ? b.dueDate.getTime() : Infinity;
    if (da !== db) return da - db;
    return (PTB_PRIORITY_RANK[b.priority] || 2) - (PTB_PRIORITY_RANK[a.priority] || 2);
  });
}

function renderPtbBoard(containerId, personId) {
  var el = document.getElementById(containerId);
  el.innerHTML = '';
  applyPtbSortModeToSelects();
  var myTasks = _personalTasksCache.filter(function (t) { return t.assigneeIds.indexOf(personId) !== -1; });

  PTB_COLS.forEach(function (col) {
    var colEl = document.createElement('div');
    colEl.className = 'ptb-col';
    colEl.setAttribute('data-status', col.key);
    var list = sortPtbTaskList(myTasks.filter(function (t) { return t.status === col.key; }));
    colEl.innerHTML =
      '<div class="ptb-col-head"><span class="sw" style="background:' + col.color + '"></span>' + col.label +
      '<span class="cnt">' + list.length + '</span></div><div class="ptb-cards"></div>';
    el.appendChild(colEl);

    var cardsEl = colEl.querySelector('.ptb-cards');
    if (list.length === 0) {
      cardsEl.innerHTML = '<div class="ptb-empty-hint">ลากการ์ดมาวางที่นี่</div>';
    } else {
      list.forEach(function (t) { cardsEl.appendChild(buildPtbCard(t)); });
    }

    colEl.addEventListener('dragover', function (e) { e.preventDefault(); colEl.classList.add('dragover'); });
    colEl.addEventListener('dragleave', function () { colEl.classList.remove('dragover'); });
    colEl.addEventListener('drop', function (e) {
      e.preventDefault();
      colEl.classList.remove('dragover');
      var taskId = e.dataTransfer.getData('text/plain');
      var task = _personalTasksCache.filter(function (t) { return t.taskId === taskId; })[0];
      if (!task || task.status === col.key) return;
      var token = localStorage.getItem(TOKEN_KEY);
      callApi('updatePersonalTaskStatus', { token: token, taskId: taskId, status: col.key }).then(function (result) {
        if (!result.success) Swal.fire({ icon: 'error', title: 'ไม่สำเร็จ', text: result.message });
        // ไม่ต้อง re-render เอง — onSnapshot จะยิงกลับมาให้ re-render อัตโนมัติ
      }).catch(function (err) {
        Swal.fire({ icon: 'error', title: 'ไม่สำเร็จ', text: err.message });
      });
    });
  });
}

function buildPtbCard(t) {
  var card = document.createElement('div');
  card.className = 'ptb-card';
  card.setAttribute('draggable', 'true');
  card.addEventListener('dragstart', function (e) {
    e.dataTransfer.setData('text/plain', t.taskId);
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', function () { card.classList.remove('dragging'); });
  card.addEventListener('click', function () { openPersonalTaskModal(t.taskId); });

  var avatars = t.assigneeIds.map(function (id) {
    return '<span class="dot" style="background:' + ptbStaffColor(id) + '">' + ptbStaffInitial(id) + '</span>';
  }).join('');

  var doneCount = t.checklist.filter(function (c) { return c.done; }).length;
  var pct = t.checklist.length ? Math.round(doneCount / t.checklist.length * 100) : 0;
  var overdue = isPtbOverdue(t);
  var prioLabel = t.priority === 'low' ? 'ต่ำ' : (t.priority === 'high' ? 'สูง' : 'กลาง');

  card.innerHTML =
    '<div class="ptb-top-row"><div class="ptb-ttl">' + escapeHtmlPtb(t.title) + '</div>' +
    '<span class="ptb-prio-pip ' + t.priority + '">' + prioLabel + '</span></div>' +
    '<div class="ptb-meta-row">' +
      (t.tag ? '<span class="ptb-tag-pip">' + escapeHtmlPtb(t.tag) + '</span>' : '') +
      '<span class="ptb-due ' + (overdue ? 'overdue' : '') + '">' + (overdue ? '⚠ ' : '📅 ') + fmtPtbDate(t.dueDate) + '</span>' +
      '<span class="ptb-avatars">' + avatars + '</span>' +
    '</div>' +
    (t.checklist.length ? '<div class="ptb-checkbar"><i style="width:' + pct + '%"></i></div>' : '');
  return card;
}

function escapeHtmlPtb(s) {
  return (s || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// ===== มุมมอง Admin/CEO — ภาพรวมทั้งบริษัท =====
function renderPtbAdminOverview() {
  var token = localStorage.getItem(TOKEN_KEY);
  callApi('getCompanyTaskSummary', { token: token }).then(function (result) {
    if (!result.success) {
      Swal.fire({ icon: 'error', title: 'โหลดภาพรวมไม่สำเร็จ', text: result.message });
      return;
    }

    document.getElementById('ptb-stat-row').innerHTML =
      '<div class="ptb-stat-tile"><div class="lbl">Task ทั้งหมด</div><div class="val">' + result.totalTasks + '</div></div>' +
      '<div class="ptb-stat-tile"><div class="lbl">เกินกำหนด</div><div class="val danger">' + result.overdueCount + '</div></div>' +
      '<div class="ptb-stat-tile"><div class="lbl">เสร็จแล้ว</div><div class="val brand">' + result.doneCount + '</div></div>';

    var deadlineHtml = result.upcoming.map(function (t) {
      var who = t.assigneeIds.map(function (id) { return ptbStaffName(id); }).join(', ');
      var d = t.dueDate ? firestoreDateToJs(t.dueDate) : null;
      // จุดสี + ข้อความ: เกินกำหนดจริง = แดง, ครบกำหนดวันนี้ = ส้ม ("วันนี้"), ยังไม่ถึงกำหนด = เหลือง + วันที่
      var dotColor = t.overdue ? '#ef4444' : (t.dueToday ? '#f97316' : '#fbbf24');
      var dateClass = t.overdue ? 'od' : (t.dueToday ? 'today' : '');
      var dateText = t.overdue ? ('เกินกำหนด · ' + fmtPtbDate(d)) : (t.dueToday ? 'วันนี้' : fmtPtbDate(d));
      return '<div class="ptb-deadline-row" onclick="openPersonalTaskModal(\'' + t.taskId + '\')">' +
        '<span class="d-dot" style="background:' + dotColor + '"></span>' +
        '<span class="d-title">' + escapeHtmlPtb(t.title) + '</span>' +
        '<span class="d-who">' + who + '</span>' +
        '<span class="d-date ' + dateClass + '">' + dateText + '</span>' +
      '</div>';
    }).join('');
    document.getElementById('ptb-deadline-list').innerHTML = deadlineHtml || '<div class="ptb-empty-hint">ไม่มีงานใกล้ครบกำหนด</div>';

    var workloadHtml = result.workload.map(function (s) {
      var totalN = s.total || 1;
      return '<div class="ptb-wl-row" onclick="viewPtbPersonBoard(\'' + s.staffId + '\')">' +
        '<div class="ptb-wl-avatar" style="background:' + (s.colorHex || '#888780') + '">' + (s.firstName || '?').charAt(0) +
          (s.hasOverdue ? '<span class="od-dot"></span>' : '') + '</div>' +
        '<div class="ptb-wl-body">' +
          '<div class="ptb-wl-name-row"><span class="ptb-wl-name">' + s.firstName + ' ' + (s.lastName || '') + '</span><span class="ptb-wl-total">' + s.total + ' งาน</span></div>' +
          '<div class="ptb-wl-bar">' +
            (s.todo ? '<span style="width:' + (s.todo / totalN * 100) + '%; background:#dfe3e6"></span>' : '') +
            (s.doing ? '<span style="width:' + (s.doing / totalN * 100) + '%; background:#fbbf24"></span>' : '') +
            (s.done ? '<span style="width:' + (s.done / totalN * 100) + '%; background:#059669"></span>' : '') +
          '</div>' +
        '</div>' +
        '<span class="ptb-wl-go">ดูบอร์ด ›</span>' +
      '</div>';
    }).join('');
    document.getElementById('ptb-workload-list').innerHTML = workloadHtml || '<div class="ptb-empty-hint">ยังไม่มีผู้ปฏิบัติงาน</div>';

    window._ptbLastSummary = result; // เก็บไว้ใช้ตอน export
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'โหลดภาพรวมไม่สำเร็จ', text: err.message });
  });
}

function viewPtbPersonBoard(staffId) {
  _ptbCurrentPersonId = staffId;
  document.getElementById('ptb-person-title').textContent = 'บอร์ดของ ' + ptbStaffName(staffId);
  document.getElementById('ptb-person-add-btn').onclick = function () { openPersonalTaskModal(null, staffId); };
  document.querySelectorAll('.ptb-view').forEach(function (v) { v.classList.remove('active'); });
  document.getElementById('ptb-view-person').classList.add('active');
  renderPtbBoard('ptb-board-person', staffId);
}

// ===== Modal เพิ่ม/แก้ไข Task =====
function openPersonalTaskModal(taskId, defaultAssigneeId) {
  _ptmEditingTaskId = taskId || null;
  _ptmPendingFiles = []; // เคลียร์ไฟล์ที่ค้างจาก modal ครั้งก่อน (กันไฟล์เก่าหลุดติดมากับ Task ใหม่ที่ไม่เกี่ยวกัน)
  var t = taskId ? _personalTasksCache.filter(function (x) { return x.taskId === taskId; })[0] : null;

  document.getElementById('ptm-title').value = t ? t.title : '';
  document.getElementById('ptm-desc').innerHTML = t ? sanitizeRichText(t.description || '') : '';
  document.getElementById('ptm-delete-btn').style.display = t ? 'block' : 'none';

  var row = document.getElementById('ptm-assignee-row');
  row.querySelectorAll('.ptm-avatar-chip').forEach(function (c) { c.remove(); });
  var myId = localStorage.getItem(ACCOUNT_ID_KEY);
  var initialAssignees = t ? t.assigneeIds.slice() : (defaultAssigneeId ? [defaultAssigneeId] : [myId]);
  initialAssignees.forEach(function (id) { ptmAddAssigneeChip(id); });
  ptmRenderAssigneePicker();

  document.getElementById('ptm-link-toggle').checked = t ? !!t.linkedEventId : false;
  document.getElementById('ptm-event-input').value = '';
  document.getElementById('ptm-event-input').setAttribute('data-event-id', t && t.linkedEventId ? t.linkedEventId : '');
  if (t && t.linkedEventId) {
    ptmLoadLinkableEvents(); // โหลดแคชก่อนเสมอ กันกรณีเปิด modal แก้ไขเป็นครั้งแรกโดยยังไม่เคยกดสวิตช์ผูก Event มาก่อน
    var ev = _ptmLinkableEventsCache.filter(function (e) { return e.taskId === t.linkedEventId; })[0];
    document.getElementById('ptm-event-input').value = ev ? ev.taskName : '(Event ที่เคยผูกไว้)';
  }
  document.getElementById('ptm-manual-date').value = t && t.dueDate ? ptbDateToInputValue(t.dueDate) : ptbDateToInputValue(new Date());
  // เช็ค "ไม่ระบุวันที่" ให้อัตโนมัติถ้าเป็นการแก้ไข Task ที่ไม่มีวันครบกำหนดและไม่ได้ผูก Event อยู่แล้ว (งานรูทีน)
  // ส่วน Task ใหม่ปล่อยว่าง (ไม่ติ๊ก) ไว้ก่อนเพื่อไม่ให้พฤติกรรมเดิม (ค่าเริ่มต้นเป็นวันนี้) เปลี่ยนไปโดยไม่ได้ตั้งใจ
  document.getElementById('ptm-nodate-toggle').checked = !!(t && !t.dueDate && !t.linkedEventId);
  ptmSyncToggle();
  ptmSyncNoDate();

  document.querySelectorAll('.ptm-prio-btn').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-p') === (t ? t.priority : 'med'));
  });

  document.getElementById('ptm-tag-input').value = '';
  document.getElementById('ptm-tag-selected').innerHTML = t && t.tag ? ptmTagChipHtml(t.tag) : '';

  var ci = document.getElementById('ptm-check-items');
  ci.innerHTML = '';
  (t ? t.checklist : []).forEach(function (item) { ptmAddCheckItemRow(item.text, item.done); });

  document.getElementById('ptm-att-list').innerHTML = (t ? t.attachments : []).map(function (a) { return ptmAttChipHtml(a); }).join('');

  document.getElementById('personal-task-modal-overlay').style.display = 'flex';
  _pushModalNav('personal-task-modal-overlay');
}
function closePersonalTaskModal() {
  document.getElementById('personal-task-modal-overlay').style.display = 'none';
}

function ptbDateToInputValue(d) {
  var yyyy = d.getFullYear(), mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return yyyy + '-' + mm + '-' + dd;
}

function ptmTagChipHtml(val) {
  return '<span class="ptm-tag-chip" data-val="' + escapeHtmlPtb(val) + '">' + escapeHtmlPtb(val) +
    ' <button onclick="document.getElementById(\'ptm-tag-selected\').innerHTML=\'\'">✕</button></span>';
}
function ptmAttChipHtml(a) {
  // แก้บั๊ก: เดิมไม่ได้ใช้ a.url เลย ไฟล์แนบเลยกดดู/เปิดไม่ได้แม้จะอัปโหลดสำเร็จแล้วก็ตาม (URL มีเก็บ
  // ไว้ในฐานข้อมูลอยู่แล้วตั้งแต่แรกจาก registerTaskAttachment แค่ฝั่งแสดงผลไม่เคยดึงมาใช้)
  var isImg = (a.type || '').indexOf('image/') === 0;
  var thumbStyle = (isImg && a.url) ? ' style="background-image:url(\'' + escapeHtmlPtb(a.url) + '\')"' : '';
  var thumbClass = 'ptm-att-thumb' + (isImg ? ' is-img' : '');
  var inner = '<div class="' + thumbClass + '"' + thumbStyle + '></div><div class="ptm-att-meta"><b>' +
    escapeHtmlPtb(a.name) + '</b><small>' + Math.round((a.size || 0) / 1024) + ' KB</small></div>';
  if (a.url) {
    // เปิดแท็บใหม่ - รูปภาพเบราว์เซอร์แสดงได้ตรงๆ ส่วนไฟล์เอกสารอื่นจะดาวน์โหลด/เปิดตามที่เบราว์เซอร์รองรับ
    return '<a class="ptm-att-chip" href="' + escapeHtmlPtb(a.url) + '" target="_blank" rel="noopener noreferrer">' + inner + '</a>';
  }
  return '<div class="ptm-att-chip">' + inner + '</div>';
}
// การ์ดไฟล์ที่ "รอบันทึก" - ใช้ตอนเพิ่ม Task ใหม่ที่ยังไม่มี taskId จริง (แนบไฟล์พร้อมกับสร้าง Task ในขั้นตอน
// เดียว) ยังอัปโหลดขึ้น Storage จริงไม่ได้ จึงโชว์เป็นการ์ดสถานะ "รอ" พร้อมปุ่มลบออกก่อนได้ถ้าเปลี่ยนใจ
function ptmPendingAttChipHtml(file, idx) {
  var isImg = (file.type || '').indexOf('image/') === 0;
  var thumbClass = 'ptm-att-thumb' + (isImg ? ' is-img' : '');
  return '<div class="ptm-att-chip ptm-att-pending" data-pending-idx="' + idx + '">' +
    '<div class="' + thumbClass + '"></div><div class="ptm-att-meta"><b>' + escapeHtmlPtb(file.name) +
    '</b><small>' + Math.round((file.size || 0) / 1024) + ' KB · รอบันทึก Task</small></div>' +
    '<button type="button" class="ptm-att-pending-rm" onclick="ptmRemovePendingFile(' + idx + ')" title="ลบไฟล์นี้ออก">✕</button></div>';
}
function ptmRemovePendingFile(idx) {
  _ptmPendingFiles[idx] = null; // เว้นตำแหน่งว่างไว้แทนการ splice กัน index ของไฟล์อื่นที่แนบไปแล้วเพี้ยน
  var el = document.querySelector('.ptm-att-pending[data-pending-idx="' + idx + '"]');
  if (el) el.remove();
}

function ptmAddAssigneeChip(id) {
  var row = document.getElementById('ptm-assignee-row');
  var chip = document.createElement('div');
  chip.className = 'ptm-avatar-chip';
  chip.setAttribute('data-id', id);
  chip.innerHTML = '<span class="dt" style="background:' + ptbStaffColor(id) + '">' + ptbStaffInitial(id) + '</span>' +
    ptbStaffName(id) + '<button class="rm">✕</button>';
  chip.querySelector('.rm').addEventListener('click', function () { chip.remove(); ptmRenderAssigneePicker(); });
  row.insertBefore(chip, row.querySelector('.ptm-picker-pop'));
}
function ptmRenderAssigneePicker() {
  var chosen = Array.prototype.map.call(document.querySelectorAll('#ptm-assignee-row .ptm-avatar-chip'), function (c) { return c.getAttribute('data-id'); });
  var list = document.getElementById('ptm-assignee-list');
  var opts = Object.keys(staffMapCache).filter(function (id) { return chosen.indexOf(id) === -1; });
  if (opts.length === 0) {
    list.innerHTML = '<div style="padding:6px 8px; font-size:11px; color:#9aa1a8">เลือกครบทุกคนแล้ว</div>';
    return;
  }
  list.innerHTML = opts.map(function (id) {
    return '<div class="ptm-picker-opt" onclick="ptmPickAssignee(\'' + id + '\')"><span class="dt" style="background:' +
      ptbStaffColor(id) + '">' + ptbStaffInitial(id) + '</span>' + ptbStaffName(id) + '</div>';
  }).join('');
}
function ptmPickAssignee(id) {
  ptmAddAssigneeChip(id);
  ptmRenderAssigneePicker();
  document.getElementById('ptm-assignee-list').classList.remove('open');
}
document.getElementById('ptm-add-assignee-btn').addEventListener('click', function (e) {
  e.stopPropagation();
  document.getElementById('ptm-assignee-list').classList.toggle('open');
});
document.addEventListener('click', function (e) {
  if (!e.target.closest('.ptm-picker-pop')) {
    var list = document.getElementById('ptm-assignee-list');
    if (list) list.classList.remove('open');
  }
});

var ptmLinkToggle = document.getElementById('ptm-link-toggle');
var ptmEventCombo = document.getElementById('ptm-event-combo');
var ptmManualDate = document.getElementById('ptm-manual-date');
var ptmToggleLabel = document.getElementById('ptm-toggle-label');
function ptmSyncToggle() {
  if (ptmLinkToggle.checked) {
    ptmEventCombo.classList.add('show');
    ptmManualDate.classList.remove('show');
    ptmToggleLabel.textContent = '🔗 ผูกกับ Event ในปฏิทิน';
    ptmLoadLinkableEvents();
  } else {
    ptmEventCombo.classList.remove('show');
    ptmManualDate.classList.add('show');
    ptmToggleLabel.textContent = '📅 กำหนดวันเอง (ไม่ผูก Event)';
  }
}
ptmLinkToggle.addEventListener('change', ptmSyncToggle);

// ===== "ไม่ระบุวันที่" - สำหรับงานรูทีนที่ไม่ต้องมีกำหนดวัน กันไม่ต้องลบวันที่ในช่องกรอกเองทุกครั้ง =====
var ptmNoDateToggle = document.getElementById('ptm-nodate-toggle');
var ptmLinkToggleWrap = document.getElementById('ptm-link-toggle-wrap');
var ptmDateFields = document.getElementById('ptm-date-fields');
function ptmSyncNoDate() {
  var noDate = ptmNoDateToggle.checked;
  ptmLinkToggleWrap.style.display = noDate ? 'none' : '';
  ptmDateFields.style.display = noDate ? 'none' : '';
}
ptmNoDateToggle.addEventListener('change', ptmSyncNoDate);

document.querySelectorAll('.ptm-prio-btn').forEach(function (b) {
  b.addEventListener('click', function () {
    document.querySelectorAll('.ptm-prio-btn').forEach(function (x) { x.classList.remove('active'); });
    b.classList.add('active');
  });
});

// ===== ค้นหา Event ในปฏิทินเพื่อผูกกับ Task (ใช้ lastTaskDocs ที่แคชไว้แล้วจากปฏิทินหลัก) =====
var _ptmLinkableEventsCache = [];
function ptmLoadLinkableEvents() {
  _ptmLinkableEventsCache = (lastTaskDocs || []).filter(function (docSnap) {
    var d = docSnap.data();
    return !d.isUndated && d.status !== 'ยกเลิกงาน';
  }).map(function (docSnap) {
    var d = docSnap.data();
    return { taskId: docSnap.id, taskName: d.taskName, startDateTime: d.startDateTime };
  });
}
var ptmEventInput = document.getElementById('ptm-event-input');
var ptmEventList = document.getElementById('ptm-event-list');
function ptmRenderEventList() {
  var q = ptmEventInput.value.trim().toLowerCase();
  var opts = _ptmLinkableEventsCache.filter(function (e) { return !q || e.taskName.toLowerCase().indexOf(q) !== -1; }).slice(0, 30);
  ptmEventList.innerHTML = opts.map(function (e) {
    var d = firestoreDateToJs(e.startDateTime);
    return '<div class="ptm-combo-opt" data-id="' + e.taskId + '" data-name="' + escapeHtmlPtb(e.taskName) + '">' +
      escapeHtmlPtb(e.taskName) + ' <span style="color:#9aa1a8">' + (d ? fmtPtbDate(d) : '') + '</span></div>';
  }).join('') || '<div style="padding:6px 9px; font-size:11.5px; color:#9aa1a8">ไม่พบ Event</div>';
  ptmEventList.querySelectorAll('.ptm-combo-opt[data-id]').forEach(function (o) {
    o.addEventListener('click', function () {
      ptmEventInput.value = o.getAttribute('data-name');
      ptmEventInput.setAttribute('data-event-id', o.getAttribute('data-id'));
      ptmEventList.classList.remove('open');
    });
  });
}
ptmEventInput.addEventListener('focus', function () { ptmRenderEventList(); ptmEventList.classList.add('open'); });
ptmEventInput.addEventListener('input', ptmRenderEventList);
document.addEventListener('click', function (e) { if (!e.target.closest('#ptm-event-combo')) ptmEventList.classList.remove('open'); });

// ===== แท็ก (combobox: เลือกจากที่มี หรือพิมพ์ใหม่แล้วเพิ่มได้เลย) =====
var ptmTagInput = document.getElementById('ptm-tag-input');
var ptmTagList = document.getElementById('ptm-tag-list');
function ptmRenderTagList() {
  var q = ptmTagInput.value.trim();
  var opts = _taskTagsCache.filter(function (tg) { return !q || tg.toLowerCase().indexOf(q.toLowerCase()) !== -1; });
  var html = opts.map(function (tg) { return '<div class="ptm-combo-opt" data-val="' + escapeHtmlPtb(tg) + '">' + escapeHtmlPtb(tg) + '</div>'; }).join('');
  var exists = _taskTagsCache.some(function (tg) { return tg.toLowerCase() === q.toLowerCase(); });
  if (q && !exists) {
    html += '<div class="ptm-combo-opt add-new" data-newval="' + escapeHtmlPtb(q) + '">+ เพิ่มแท็กใหม่ "' + escapeHtmlPtb(q) + '"</div>';
  }
  ptmTagList.innerHTML = html;
  ptmTagList.querySelectorAll('.ptm-combo-opt[data-val]').forEach(function (o) {
    o.addEventListener('click', function () { ptmSelectTag(o.getAttribute('data-val')); });
  });
  var addBtn = ptmTagList.querySelector('.add-new');
  if (addBtn) {
    addBtn.addEventListener('click', function () {
      var newVal = addBtn.getAttribute('data-newval');
      var token = localStorage.getItem(TOKEN_KEY);
      callApi('addTaskTag', { token: token, name: newVal }).then(function (result) {
        if (result.success) ptmSelectTag(result.name);
        else Swal.fire({ icon: 'error', title: 'เพิ่มแท็กไม่สำเร็จ', text: result.message });
      });
    });
  }
}
function ptmSelectTag(val) {
  document.getElementById('ptm-tag-selected').innerHTML = ptmTagChipHtml(val);
  ptmTagInput.value = '';
  ptmTagList.classList.remove('open');
}
ptmTagInput.addEventListener('focus', function () { ptmRenderTagList(); ptmTagList.classList.add('open'); });
ptmTagInput.addEventListener('input', ptmRenderTagList);
document.addEventListener('click', function (e) { if (!e.target.closest('#ptm-tag-input') && !e.target.closest('#ptm-tag-list')) ptmTagList.classList.remove('open'); });

// ===== Checklist =====
var ptmCheckInput = document.getElementById('ptm-check-input');
function ptmAddCheckItemRow(text, done) {
  var row = document.createElement('div');
  row.className = 'ptm-check-item' + (done ? ' done' : '');
  row.innerHTML = '<input type="checkbox" ' + (done ? 'checked' : '') + '><span>' + escapeHtmlPtb(text) + '</span><button class="rm">✕</button>';
  row.querySelector('input').addEventListener('change', function (e) { row.classList.toggle('done', e.target.checked); });
  row.querySelector('.rm').addEventListener('click', function () { row.remove(); });
  document.getElementById('ptm-check-items').appendChild(row);
}
document.getElementById('ptm-check-add-btn').addEventListener('click', function () {
  var v = ptmCheckInput.value.trim();
  if (v) { ptmAddCheckItemRow(v, false); ptmCheckInput.value = ''; }
});
ptmCheckInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    var v = ptmCheckInput.value.trim();
    if (v) { ptmAddCheckItemRow(v, false); ptmCheckInput.value = ''; }
  }
});

// ===== ไฟล์แนบ: รูปภาพบีบอัดผ่าน canvas ก่อนเสมอ (แนวทางเดียวกับรูปโปรไฟล์) ไฟล์อื่นอัปโหลดตรง =====
// ปรับให้ "เพิ่ม Task ใหม่ + แนบไฟล์" ทำได้ในขั้นตอนเดียว: ถ้ากำลังแก้ไข Task ที่มีอยู่แล้ว (_ptmEditingTaskId)
// อัปโหลดขึ้น Storage ทันที เหมือนเดิม แต่ถ้ากำลังสร้าง Task ใหม่ (ยังไม่มี taskId จริง เลยอัปโหลดขึ้น Storage
// ไม่ได้ทันที เพราะ Storage Rules เช็ค assigneeIds ของ Task ที่มีอยู่จริงในฐานข้อมูล) จะพักไฟล์ไว้ใน
// _ptmPendingFiles ก่อน แล้วอัปโหลดจริงทันทีหลังบันทึก Task สำเร็จใน savePersonalTaskModal()
function ptmUploadOneFile(taskId, token, file) {
  return new Promise(function (resolve, reject) {
    function uploadBlob(blob, contentType, displayName) {
      var fileName = Date.now() + '_' + displayName.replace(/[^a-zA-Z0-9._-]/g, '_');
      var storageRef = fbStorage.ref('taskAttachments/' + taskId + '/' + fileName);
      var uploadedUrl = ''; // เก็บ URL ที่อัปโหลดได้ไว้ใช้ตอนเติมการ์ดแนบไฟล์ทันที (กันต้องปิด-เปิด modal ใหม่ถึงจะกดดูได้)
      storageRef.put(blob, { contentType: contentType }).then(function () {
        return storageRef.getDownloadURL();
      }).then(function (url) {
        uploadedUrl = url;
        return callApi('registerTaskAttachment', {
          token: token, taskId: taskId, url: url, thumbUrl: '', name: displayName, size: blob.size, type: contentType
        });
      }).then(function (result) {
        if (result.success) {
          resolve({ name: displayName, size: blob.size, url: uploadedUrl, type: contentType });
        } else {
          reject(new Error(result.message || 'แนบไฟล์ไม่สำเร็จ'));
        }
      }).catch(reject);
    }

    if (file.type.startsWith('image/')) {
      var img = new Image();
      var objectUrl = URL.createObjectURL(file);
      img.onload = function () {
        var MAX_SIZE = 1600;
        var w = img.width, h = img.height;
        if (w > h && w > MAX_SIZE) { h = Math.round(h * (MAX_SIZE / w)); w = MAX_SIZE; }
        else if (h > MAX_SIZE) { w = Math.round(w * (MAX_SIZE / h)); h = MAX_SIZE; }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(objectUrl);
        canvas.toBlob(function (blob) { uploadBlob(blob, 'image/jpeg', file.name); }, 'image/jpeg', 0.75);
      };
      img.onerror = function () { URL.revokeObjectURL(objectUrl); reject(new Error('เปิดไฟล์รูปไม่ได้')); };
      img.src = objectUrl;
    } else {
      if (file.size > 5 * 1024 * 1024) {
        reject(new Error('ไฟล์เอกสารต้องไม่เกิน 5MB'));
        return;
      }
      uploadBlob(file, file.type || 'application/octet-stream', file.name);
    }
  });
}

document.getElementById('ptm-drop-zone').addEventListener('click', function () {
  document.getElementById('ptm-file-input').click();
});
document.getElementById('ptm-file-input').addEventListener('change', function (e) {
  var file = e.target.files[0];
  if (!file) return;

  if (_ptmEditingTaskId) {
    // Task มีอยู่แล้ว - อัปโหลดขึ้น Storage ได้ทันทีเหมือนเดิม
    var token = localStorage.getItem(TOKEN_KEY);
    ptmUploadOneFile(_ptmEditingTaskId, token, file).then(function (att) {
      document.getElementById('ptm-att-list').insertAdjacentHTML('beforeend', ptmAttChipHtml(att));
      Toast.fire({ icon: 'success', title: 'แนบไฟล์แล้ว' });
    }).catch(function (err) {
      Swal.fire({ icon: 'error', title: 'แนบไฟล์ไม่สำเร็จ', text: err.message });
    });
  } else {
    // กำลังเพิ่ม Task ใหม่ - ยังไม่มี taskId จริง พักไฟล์ไว้ก่อน แสดงเป็นการ์ด "รอบันทึก Task"
    // แล้วจะอัปโหลดจริงทันทีหลังกดบันทึก Task สำเร็จ (ผู้ใช้เลยทำ add + แนบไฟล์ ในขั้นตอนเดียวได้)
    var idx = _ptmPendingFiles.length;
    _ptmPendingFiles.push(file);
    document.getElementById('ptm-att-list').insertAdjacentHTML('beforeend', ptmPendingAttChipHtml(file, idx));
  }
  e.target.value = '';
});

// ===== บันทึก / ลบ Task =====
function savePersonalTaskModal() {
  var title = document.getElementById('ptm-title').value.trim();
  if (!title) { Swal.fire({ icon: 'warning', title: 'กรุณาใส่ชื่องาน' }); return; }

  var assigneeIds = Array.prototype.map.call(document.querySelectorAll('#ptm-assignee-row .ptm-avatar-chip'), function (c) { return c.getAttribute('data-id'); });
  var prioBtn = document.querySelector('.ptm-prio-btn.active');
  var priority = prioBtn ? prioBtn.getAttribute('data-p') : 'med';
  var tagChip = document.querySelector('#ptm-tag-selected .ptm-tag-chip');
  var tag = tagChip ? tagChip.getAttribute('data-val') : '';
  var noDate = document.getElementById('ptm-nodate-toggle').checked;
  var linked = !noDate && ptmLinkToggle.checked;
  var linkedEventId = linked ? (ptmEventInput.getAttribute('data-event-id') || '') : '';
  var dueDate = noDate ? '' : (linked ? null : ptmManualDate.value);
  var checklist = Array.prototype.map.call(document.querySelectorAll('#ptm-check-items .ptm-check-item'), function (r) {
    return { text: r.querySelector('span').textContent, done: r.classList.contains('done') };
  });

  if (linked && !linkedEventId) {
    Swal.fire({ icon: 'warning', title: 'กรุณาเลือก Event ที่จะผูก', text: 'หรือปิดสวิตช์เพื่อกำหนดวันเอง' });
    return;
  }

  var ptmDescEl = document.getElementById('ptm-desc');
  var description = ptmDescEl.textContent.trim() ? sanitizeRichText(ptmDescEl.innerHTML) : '';

  var token = localStorage.getItem(TOKEN_KEY);
  var payload = {
    token: token, title: title, description: description,
    assigneeIds: assigneeIds, priority: priority, tag: tag,
    linkedEventId: linked ? linkedEventId : null, dueDate: dueDate, checklist: checklist
  };

  var action = _ptmEditingTaskId ? 'updatePersonalTask' : 'createPersonalTask';
  if (_ptmEditingTaskId) payload.taskId = _ptmEditingTaskId;

  callApi(action, payload).then(function (result) {
    if (!result.success) { Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: result.message }); return; }

    // ถ้าเป็น Task ใหม่และมีไฟล์ที่พักไว้ตอนเพิ่ม Task (แนบพร้อมกับ add ในขั้นตอนเดียว) ให้อัปโหลดขึ้น Storage
    // จริงทันทีตอนนี้ เพราะเพิ่งมี taskId จริงแล้ว (ก่อนหน้านี้อัปโหลดไม่ได้เพราะ Storage Rules เช็ค
    // assigneeIds ของ Task ที่มีอยู่จริงในฐานข้อมูล)
    var pendingFiles = _ptmPendingFiles.filter(function (f) { return f; });
    if (!_ptmEditingTaskId && pendingFiles.length && result.taskId) {
      var newTaskId = result.taskId;
      var failCount = 0;
      var chain = Promise.resolve();
      pendingFiles.forEach(function (file) {
        chain = chain.then(function () {
          return ptmUploadOneFile(newTaskId, token, file).catch(function () { failCount++; });
        });
      });
      chain.then(function () {
        _ptmPendingFiles = [];
        Toast.fire({
          icon: failCount ? 'warning' : 'success',
          title: failCount ? ('เพิ่ม Task ใหม่แล้ว (แนบไฟล์ไม่สำเร็จ ' + failCount + ' ไฟล์ กรุณาแนบใหม่)') : 'เพิ่ม Task ใหม่แล้ว พร้อมไฟล์แนบ'
        });
        closePersonalTaskModal();
      });
      return;
    }

    Toast.fire({ icon: 'success', title: _ptmEditingTaskId ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่ม Task ใหม่แล้ว' });
    closePersonalTaskModal();
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: err.message });
  });
}

function deleteCurrentPersonalTask() {
  if (!_ptmEditingTaskId) return;
  var taskId = _ptmEditingTaskId;
  Swal.fire({
    icon: 'warning', title: 'ยืนยันลบ Task นี้?', showCancelButton: true,
    confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก'
  }).then(function (res) {
    if (!res.isConfirmed) return;
    var token = localStorage.getItem(TOKEN_KEY);
    callApi('deletePersonalTask', { token: token, taskId: taskId }).then(function (result) {
      if (!result.success) { Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: result.message }); return; }
      Toast.fire({ icon: 'success', title: 'ลบ Task แล้ว' });
      closePersonalTaskModal();
    });
  });
}

// ===== Export รายงาน =====
document.querySelectorAll('.ptx-preset-btn').forEach(function (b) {
  b.addEventListener('click', function () { document.querySelectorAll('.ptx-preset-btn').forEach(function (x) { x.classList.remove('active'); }); b.classList.add('active'); });
});
document.querySelectorAll('.ptx-fmt-btn').forEach(function (b) {
  b.addEventListener('click', function () { document.querySelectorAll('.ptx-fmt-btn').forEach(function (x) { x.classList.remove('active'); }); b.classList.add('active'); });
});
function openTaskExportModal() { document.getElementById('task-export-modal-overlay').style.display = 'flex'; _pushModalNav('task-export-modal-overlay'); }
function closeTaskExportModal() { document.getElementById('task-export-modal-overlay').style.display = 'none'; }

function doTaskExport() {
  var range = document.querySelector('.ptx-preset-btn.active').getAttribute('data-r');
  var fmt = document.querySelector('.ptx-fmt-btn.active').getAttribute('data-f');
  var token = localStorage.getItem(TOKEN_KEY);

  // เปิดแท็บใหม่ไว้ล่วงหน้าตั้งแต่ตรงนี้เลย (ยัง synchronous ต่อเนื่องจาก click ปุ่ม "สร้างไฟล์" อยู่) ก่อนจะ
  // ไปรอ callApi แบบ async - ถ้ารอไปเปิดแท็บใหม่ทีหลังใน .then() เบราว์เซอร์จะมองว่าไม่ได้มาจาก user gesture
  // โดยตรงแล้ว แล้วบล็อก popup ทันที ค่อยส่งแท็บที่เปิดไว้แล้วนี้ไปเติมเนื้อหาทีหลังเมื่อข้อมูลพร้อม
  var preOpenedTab = window.open('', '_blank');
  if (preOpenedTab) {
    preOpenedTab.document.write('<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:24px;color:#6b7280">กำลังสร้างรายงาน...</body>');
  }

  callApi('exportTaskReport', { token: token, range: range }).then(function (result) {
    if (!result.success) {
      if (preOpenedTab) preOpenedTab.close();
      Swal.fire({ icon: 'error', title: 'Export ไม่สำเร็จ', text: result.message });
      return;
    }
    closeTaskExportModal();

    if (fmt === 'xlsx') {
      var rows = result.rows.map(function (r) {
        return {
          'ชื่องาน': r.title, 'สถานะ': r.status === 'done' ? 'เสร็จแล้ว' : (r.status === 'doing' ? 'กำลังทำ' : 'ต้องทำ'),
          'ความสำคัญ': r.priority, 'แท็ก': r.tag,
          'ผู้รับผิดชอบ': r.assigneeIds.map(function (id) { return ptbStaffName(id); }).join(', '),
          'วันครบกำหนด': r.dueDate ? new Date(r.dueDate).toLocaleDateString('th-TH') : '',
          'สร้างเมื่อ': new Date(r.createdAt).toLocaleDateString('th-TH')
        };
      });
      var ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 25 }, { wch: 14 }, { wch: 14 }];
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Task Report');
      exportWorkbookViaNewTab(wb, 'C2Calendar_TaskReport_' + range + '.xlsx', preOpenedTab);
    } else {
      var periodLabel = 'Task Board — ' + (range === 'week' ? 'สัปดาห์นี้' : (range === 'month' ? 'เดือนนี้' : 'ไตรมาสนี้'));

      var doneCount = result.rows.filter(function (r) { return r.status === 'done'; }).length;
      var doingCount = result.rows.filter(function (r) { return r.status === 'doing'; }).length;
      var todoCount = result.rows.filter(function (r) { return r.status === 'todo'; }).length;
      var donutSegments = [
        { label: 'เสร็จแล้ว', count: doneCount, color: '#3F654D' },
        { label: 'กำลังทำ', count: doingCount, color: '#D97706' },
        { label: 'ต้องทำ', count: todoCount, color: '#9AA6A0' }
      ];
      var donutTotal = doneCount + doingCount + todoCount;

      // ภาระงานรายคน: นับจำนวน Task ที่แต่ละคนรับผิดชอบ (นับซ้ำได้ถ้า Task มีผู้รับผิดชอบหลายคน)
      var workloadCount = {};
      result.rows.forEach(function (r) {
        (r.assigneeIds || []).forEach(function (id) { workloadCount[id] = (workloadCount[id] || 0) + 1; });
      });
      var workload = Object.keys(workloadCount)
        .sort(function (a, b) { return workloadCount[b] - workloadCount[a]; })
        .slice(0, 8)
        .map(function (id) { return { name: ptbStaffName(id), count: workloadCount[id], color: ptbStaffColor(id) }; });

      // งานเกินกำหนด/ใกล้ครบกำหนด (ไม่นับ Task ที่เสร็จแล้ว - ตามนิยามเดียวกับฝั่ง backend getCompanyTaskSummary)
      var todayOnly = new Date(); todayOnly.setHours(0, 0, 0, 0);
      var dueRows = result.rows.filter(function (r) { return r.status !== 'done' && r.dueDate; }).map(function (r) {
        var due = new Date(r.dueDate); due.setHours(0, 0, 0, 0);
        var diffDays = Math.round((due - todayOnly) / 86400000);
        return { title: r.title, diffDays: diffDays };
      });
      var overdueItems = dueRows.filter(function (r) { return r.diffDays < 0; })
        .sort(function (a, b) { return a.diffDays - b.diffDays; }).slice(0, 4)
        .map(function (r) { return { label: r.title, badge: 'เกิน ' + Math.abs(r.diffDays) + ' วัน' }; });
      var upcomingItems = dueRows.filter(function (r) { return r.diffDays >= 0; })
        .sort(function (a, b) { return a.diffDays - b.diffDays; }).slice(0, 4)
        .map(function (r) {
          var badge = r.diffDays === 0 ? 'วันนี้' : (r.diffDays === 1 ? 'พรุ่งนี้' : 'อีก ' + r.diffDays + ' วัน');
          return { label: r.title, badge: badge, badgeColor: r.diffDays <= 1 ? '#B45309' : '#63816F' };
        });

      var html = execReportHtml({
        periodLabel: periodLabel,
        dateRangeLabel: range === 'week' ? 'สัปดาห์นี้' : (range === 'month' ? 'เดือนนี้' : 'ไตรมาสนี้'),
        totalLabel: 'งานทั้งหมด',
        donutSegments: donutSegments,
        donutSectionTitle: 'สถานะงาน',
        donutCenterPct: donutTotal > 0 ? Math.round(doneCount / donutTotal * 100) : 0,
        donutCenterSub: 'เสร็จแล้ว',
        workload: workload,
        rightWarning: overdueItems.length ? { headerText: overdueItems.length + ' งานเกินกำหนดแล้ว ต้องติดตามด่วน', items: overdueItems } : null,
        rightListTitle: 'ใกล้ครบกำหนด',
        rightListItems: upcomingItems,
        generatedAtLabel: fmtGeneratedAtLabel()
      });
      openExecReportInNewTab(html, preOpenedTab);
    }
  }).catch(function (err) {
    if (preOpenedTab) preOpenedTab.close();
    Swal.fire({ icon: 'error', title: 'Export ไม่สำเร็จ', text: err.message });
  });
}