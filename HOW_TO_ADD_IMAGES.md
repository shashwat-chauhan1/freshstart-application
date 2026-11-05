# 📸 How to Add Real IMSEC Campus Images

Currently, the app uses **placeholder SVG images** (blue boxes with text). Follow these steps to add real photos from your college:

---

## 📋 Required Images

### **Logo & Hero (2 images)**
- `public/images/imsec-logo.png` — College logo (transparent background recommended)
- `public/images/hero-campus.jpg` — Main campus aerial/wide shot for hero section

### **Location Photos (12 images)**
Place these in `public/images/`:

1. `loc-gate.jpg` — Main Gate entrance
2. `loc-admin.jpg` — Admin Block building
3. `loc-library.jpg` — Learning Resource Centre (library)
4. `loc-academic.jpg` — Academic Block A
5. `loc-computer.jpg` — Computer Centre/Lab
6. `loc-canteen.jpg` — College Canteen
7. `loc-hostel.jpg` — Hostel buildings
8. `loc-sports.jpg` — Sports Complex/ground
9. `loc-auditorium.jpg` — Auditorium hall
10. `loc-gym.jpg` — Gymnasium
11. `loc-career.jpg` — Career Development Centre
12. `loc-conference.jpg` — Conference Hall

### **Infrastructure & Department Photos (15 images)**
Place these in `public/images/inner/`:

**Infrastructure (10):**
1. `infra-library.jpg` — Inside library view
2. `infra-computer.jpg` — Computer lab inside
3. `infra-lab.jpg` — Practical lab equipment
4. `infra-auditorium.jpg` — Auditorium stage/seats
5. `infra-conference.jpg` — Conference room
6. `infra-career.jpg` — CDC/Placement office
7. `infra-gym.jpg` — Gym equipment
8. `infra-hostel.jpg` — Hostel rooms
9. `infra-sports.jpg` — Sports facilities
10. `infra-campus.jpg` — General campus life

**Departments (5):**
1. `dept-cse.jpg` — CSE Department
2. `dept-it.jpg` — IT Department
3. `dept-ece.jpg` — ECE Department
4. `dept-mba.jpg` — MBA Department
5. `dept-mca.jpg` — MCA Department

---

## 🔧 How to Replace Placeholder Images

### **Step 1: Get Real Photos**
Options:
- Take photos yourself with mobile/camera
- Ask college administration/media cell
- Download from official college website (if available)
- Get from senior students who have campus photos

### **Step 2: Rename & Place Files**
1. Rename your photos exactly as listed above
2. Place location photos in: `public/images/`
3. Place inner/dept photos in: `public/images/inner/`

### **Step 3: Update References (if using SVG placeholders)**

If you replaced placeholder SVGs, update these files:

**`public/index.html`** — Change logo references:
```html
<!-- Find this: -->
<img src="images/logo-placeholder.svg" ...>

<!-- Replace with: -->
<img src="images/imsec-logo.png" ...>
```

**`public/style.css`** — Uncomment hero background:
```css
.hero {
  /* background-image: url('images/hero-campus.jpg'); */  ← Remove comment
}
```

**`data/campus.json`** — Update location image paths:
```json
{"id": 0, "name": "Main Gate", "img": "images/loc-gate.jpg"}
```

---

## 📐 Recommended Image Specifications

- **Logo:** 300×100px PNG with transparent background
- **Hero:** 1920×1080px landscape JPG
- **Location photos:** 800×600px JPG (landscape)
- **Inner/Dept photos:** 800×600px JPG (landscape)
- **File size:** Keep under 500KB per image for fast loading

---

## ✅ Testing

After adding images:
1. Restart the server: `python run.py`
2. Open http://localhost:3000
3. Check all 6 tabs to verify images load correctly
4. Use browser DevTools (F12) → Network tab to check for 404 errors

---

## 💡 Tips

- Use consistent lighting and angles for professional look
- Compress images using tools like TinyPNG or Squoosh
- Take photos during daytime for better quality
- Avoid photos with students' faces (privacy)
- Get permission before photographing college premises

---

**Need help?** Check that:
- File names match exactly (case-sensitive)
- Files are in correct folders
- Images are JPG/PNG format
- Server is restarted after adding files
