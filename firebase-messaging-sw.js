// ===== Service Worker สำหรับ Firebase Cloud Messaging (Web Push) =====
// ไฟล์นี้ต้องอยู่ที่ root ของเว็บ (โฟลเดอร์เดียวกับ index.html) เท่านั้น ห้ามย้ายเข้าโฟลเดอร์ย่อย เพราะ scope
// ของ service worker ครอบคลุมแค่ path ที่ตัวไฟล์เองอยู่ลงไป (อยู่ที่ root ถึงจะครอบคลุมทั้งเว็บ) - ดูการ
// ลงทะเบียนที่ setupPushNotifications() ใน app.js (navigator.serviceWorker.register('firebase-messaging-sw.js'))
//
// ทำงานเฉพาะตอนแอป/แท็บ "ไม่ได้เปิดอยู่" (background/ปิดไปแล้ว) เท่านั้น - ตอนเปิดแอปอยู่ (foreground) FCM จะไม่
// เรียกไฟล์นี้ แต่จะยิง event ผ่าน messaging.onMessage() ในหน้าเว็บโดยตรงแทน (ดู setupPushNotifications())

importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

// ค่าเดียวกับ firebaseConfig ใน app.js ทุกตัวอักษร (service worker แยกไฟล์ แชร์ตัวแปรกับหน้าเว็บหลักไม่ได้
// ต้องประกาศซ้ำที่นี่) ถ้าวันไหนแก้ firebaseConfig ในนั้น อย่าลืมมาแก้ที่นี่ให้ตรงกันด้วย
firebase.initializeApp({
  apiKey: "AIzaSyBjJLodAV1hkgaxxmgzvccMVAIW5S8hbqw",
  authDomain: "c2-calendar-c088f.firebaseapp.com",
  projectId: "c2-calendar-c088f",
  storageBucket: "c2-calendar-c088f.firebasestorage.app",
  messagingSenderId: "366484323689",
  appId: "1:366484323689:web:cce308b7968a77db3791f8"
});

var messaging = firebase.messaging();

// แก้บั๊ก: แจ้งเตือนเด้งซ้อน 2 ใบต่อ push 1 ครั้ง - เดิมโค้ดตรงนี้เรียก self.registration.showNotification()
// เอง แต่ payload ที่ backend ส่งมา (ดู sendPushToAccount() ใน functions/index.js) มีฟิลด์
// "notification: {title, body}" ติดมาด้วยเสมอ ซึ่งพอ payload มีฟิลด์ notification แบบนี้ ตัว Firebase
// Messaging SDK เองจะโชว์ notification ของระบบปฏิบัติการให้อัตโนมัติอยู่แล้ว (ก่อนโค้ดข้างล่างนี้จะรันด้วยซ้ำ)
// - เรียก showNotification() เองซ้ำอีกที เลยกลายเป็นเด้ง 2 ใบต่อ 1 push (icon/badge/data ที่เคยตั้งเองตรงนี้
// ก็มาจาก payload.webpush.notification/data ซึ่ง SDK ใช้ตอนโชว์อัตโนมัติอยู่แล้วเหมือนกัน ไม่ได้หายไปไหน)
// เลยตัดการเรียก showNotification() เองออก ปล่อยให้ SDK โชว์แบบเดียวพอ - ถ้าวันไหนอยากทำอะไรเพิ่มเติมตอน
// รับ background message (เช่นอัปเดต badge count) ค่อยมาเติม logic อื่นในนี้ได้ แต่ห้ามเรียก showNotification เอง
messaging.onBackgroundMessage(function (payload) {
  // ไม่ต้องทำอะไร - SDK โชว์ notification ให้อัตโนมัติแล้วจาก payload.notification ที่ backend ส่งมา
});

// กดที่ตัว notification แล้วโฟกัสแท็บที่เปิดอยู่ (ถ้ามี) หรือเปิดแท็บใหม่เข้าแอป
//
// แก้บั๊ก: เดิมโค้ดตรงนี้เรียก clients.openWindow('/') ซึ่งเป็น path แบบ absolute จาก root ของโดเมน
// (เช่น theastro29.github.io/) แต่แอปนี้ deploy อยู่ใต้ subpath ของ GitHub Pages (เช่น
// theastro29.github.io/C2-Calendar/ - ดูได้จาก manifest.json ที่ตั้ง start_url เป็น "./index.html"
// แบบ relative) เลยกลายเป็นกดแจ้งเตือนแล้วเด้งไปหน้า root เปล่าๆ ของ GitHub Pages แทนที่จะเข้าแอปจริง
// (เกิดเฉพาะตอนไม่มีแท็บแอปเปิดอยู่เบื้องหลังอยู่แล้ว - ถ้ามีแท็บเปิดอยู่ โค้ด focus() ด้านบนจะทำงานก่อน
// เลยไม่เจอบั๊กนี้)
//
// แก้โดยคำนวณ URL ของแอปจาก self.registration.scope แทนการ hardcode '/' - scope ของ service worker
// จะเท่ากับ path ของโฟลเดอร์ที่ตัวไฟล์นี้เองถูกลงทะเบียนอยู่เสมอ (ดูคอมเมนต์บนสุดของไฟล์ - ไฟล์นี้ต้องอยู่
// โฟลเดอร์เดียวกับ index.html) ดังนั้นไม่ว่าแอปจะ deploy อยู่ที่ root หรือ subpath ไหนก็ตาม ค่านี้จะถูกต้อง
// เสมอโดยไม่ต้องมาแก้โค้ดซ้ำถ้าวันหลังย้าย repo/domain
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  var appUrl = new URL('index.html', self.registration.scope).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        if ('focus' in clientList[i]) return clientList[i].focus();
      }
      if (clients.openWindow) return clients.openWindow(appUrl);
    })
  );
});
