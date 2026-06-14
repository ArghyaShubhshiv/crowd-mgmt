import ws from 'k6/ws';
import { check } from 'k6';

// 1. Define the load profile
export const options = {
  vus: 10, // Let's start small: 10 users for 1 minute
  duration: '1m', 
};

// Removed the experimental crypto import. 
// Standard Math.random is perfectly fine for simulating unique visitors.
function generateToken() {
  return Math.random().toString(36).substring(2, 14);
}

// Helper to simulate a random walk within a bounding box
function moveVisitor(currentLocation) {
  const deltaLat = (Math.random() - 0.5) * 0.001;
  const deltaLng = (Math.random() - 0.5) * 0.001;

  let newLat = currentLocation.lat + deltaLat;
  let newLng = currentLocation.lng + deltaLng;

  let zoneId = 'zone_main_floor';
  if (newLat > 40.713) zoneId = 'zone_vip_lounge';
  else if (newLng < -74.007) zoneId = 'zone_entrance_lobby';

  return { lat: newLat, lng: newLng, zone_id: zoneId };
}

export default function () {
  const orgId = 'org_festival_a'; 
  const url = `ws://localhost:3002/locations?org_id=${orgId}`;
  
  const visitorToken = `user_${generateToken()}`;
  
  let location = {
    lat: 40.7128,
    lng: -74.0060,
    zone_id: 'zone_main_floor'
  };

  const params = { tags: { my_tag: 'hello' } };

  const res = ws.connect(url, params, function (socket) {
    socket.on('open', function () {
      console.log(`VU ${__VU}: Connected with token ${visitorToken}`);

      socket.setInterval(function () {
        location = moveVisitor(location);

        const payload = JSON.stringify({
          visitor_token: visitorToken,
          zone_id: location.zone_id,
          lat: parseFloat(location.lat.toFixed(6)),
          lng: parseFloat(location.lng.toFixed(6)),
          timestamp: Date.now()
        });

        socket.send(payload);
      }, 1000); 
    });

    socket.on('close', function () {
      console.log(`VU ${__VU}: Disconnected`);
    });

    socket.on('error', function (e) {
      // It will throw an error right now because the backend isn't up yet.
      console.error(`VU ${__VU}: WebSocket Error: `, e.error());
    });

    socket.setTimeout(function () {
      socket.close();
    }, 55000); 
  });

  check(res, { 'status is 101 (Switching Protocols)': (r) => r && r.status === 101 });
}