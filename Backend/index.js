const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const bcrypt = require('bcrypt');                 // <-- NEW: for hashing admin password
const app = express();
const bodyParser = require('body-parser');

// Load environment variables from .env
dotenv.config();

// Middleware
app.use(cors());
app.use(express.json()); // parses JSON
app.use(bodyParser.urlencoded({ extended: true })); // for HTML forms

// Test route
app.get('/', (req, res) => {
  res.send('✅ Backend is working!');
});

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(async () => {
    console.log('✅ MongoDB Connected');
    await ensureDefaultAdmin();                  // <-- NEW: auto-create admin in DB if missing
  })
  .catch((err) => console.error('❌ MongoDB Error:', err));

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

// ====== MODELS ======
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  age: Number,
  gender: String,
  blood: String
});
const User = mongoose.model('User', userSchema);

const donationSchema = new mongoose.Schema({
  email: { type: String, required: true },    // donor email
  date: { type: String, required: true },     // ISO string YYYY-MM-DD
  bloodBank: { type: String, required: true },
  status: { type: String, default: "Scheduled" } // Scheduled | Completed | Cancelled
});
const Donation = mongoose.model("Donation", donationSchema);

// ⬇️ UPDATED: schema now records donor responses
const alertSchema = new mongoose.Schema({
  message: { type: String, required: true },
  group: { type: String, default: "" }, // "" => All, else e.g. "O+"
  createdAt: { type: Date, default: Date.now },
  responses: [{
    email: String,
    status: { type: String, enum: ["accepted", "declined"] },
    eta: String, // store datetime-local string from client
    respondedAt: { type: Date, default: Date.now }
  }]
});
const Alert = mongoose.model("Alert", alertSchema);

/* ====== NEW: ADMIN MODEL (DB-backed admin with hashed password) ====== */
const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: "admin" }
});
const Admin = mongoose.model("Admin", adminSchema);

/* ====== NEW: REQUESTS MODEL ====== */
const requestSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, index: true },
  phone: { type: String },
  blood: {
    type: String,
    required: true,
    enum: ["A+","A-","B+","B-","O+","O-","AB+","AB-"]
  },
  units: { type: Number, required: true, min: 1 },
  neededBy: { type: String, required: true },   // keep as YYYY-MM-DD string
  hospital: { type: String, required: true },
  location: { type: String, required: true },
  notes: { type: String },
  status: { type: String, enum: ["Pending","Accepted","Rejected"], default: "Pending", index: true },
  acceptedAt: { type: Date },
  rejectedAt: { type: Date }
}, { timestamps: true });

const Request = mongoose.model("Request", requestSchema);
// Add after: const Request = mongoose.model("Request", requestSchema);

const inventorySchema = new mongoose.Schema({
  hospital: { type: String, required: true },
  bloodGroup: {
    type: String,
    required: true,
    enum: ["A+","A-","B+","B-","O+","O-","AB+","AB-"]
  },
  units: { type: Number, required: true, min: 1 },
  addedAt: { type: Date, default: Date.now }
});
const Inventory = mongoose.model("Inventory", inventorySchema);


// ====== AUTH & USERS ======

// Handle signup
app.post('/signup', async (req, res) => {
  try {
    const { name, email, password, age, gender, blood } = req.body;

    const newUser = new User({ name, email, password, age, gender, blood });
    await newUser.save();

    res.json({ message: '✅ Signup successful!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '❌ Signup failed.' });
  }
});

// Handle login
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });

    if (!user || user.password !== password) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    // Success - send full user object (without password)
    res.json({
      success: true,
      message: 'Login successful!',
      user: {
        name: user.name,
        email: user.email,
        blood: user.blood,
        age: user.age,
        gender: user.gender,
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
});

// Get a single user by email (used by dashboard)
app.post("/getUser", async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (user) {
      res.json({ success: true, data: user });
    } else {
      res.json({ success: false, message: "User not found" });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ====== ADMIN ======

// Dummy admin auth (open for now)
const adminAuth = (req, res, next) => {
  // TODO: add token/session validation here later
  next();
};

// Get all users (admin dashboard)
app.get("/admin/users", adminAuth, async (req, res) => {
  try {
    const users = await User.find({});
    res.json({ success: true, users });
  } catch (err) {
    console.error("Admin user fetch failed:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ====== NEW: ADMIN LOGIN using DB + bcrypt ====== */
app.post("/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1) find admin by email in DB
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(401).json({ success: false, message: "Invalid admin credentials" });
    }

    // 2) compare password with stored hash
    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) {
      return res.status(401).json({ success: false, message: "Invalid admin credentials" });
    }

    // 3) success — (for demo) just reply success (later: issue JWT/cookie)
    return res.json({ success: true, message: "Admin login successful" });
  } catch (err) {
    console.error("admin login error", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ====== ADMIN: Alerts saved to DB ======

// Save alert (with optional blood group)
app.post("/admin/alert", adminAuth, async (req, res) => {
  try {
    const { message, group = "" } = req.body;
    if (!message?.trim()) {
      return res.status(400).json({ success: false, message: "Message is required" });
    }
    await Alert.create({ message: message.trim(), group });
    console.log("🚨 Admin alert:", { message, group: group || "All" });
    res.json({ success: true, message: "Alert saved" });
  } catch (err) {
    console.error("save alert error", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Donors fetch alerts (optionally filter by blood group via ?blood=O+)
app.get("/alerts", async (req, res) => {
  try {
    const { blood } = req.query;
    const query = blood ? { $or: [{ group: "" }, { group: blood }] } : {};
    const alerts = await Alert.find(query).sort({ createdAt: 1 });
    res.json({ success: true, alerts });
  } catch (err) {
    console.error("get alerts error", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// NEW: donor responds to an alert (accept/decline + ETA)
app.post("/alerts/:id/respond", async (req, res) => {
  try {
    const { email, status, eta } = req.body;
    if (!email || !status) {
      return res.status(400).json({ success: false, message: "email and status are required" });
    }
    if (!["accepted", "declined"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const updated = await Alert.findByIdAndUpdate(
      req.params.id,
      { $push: { responses: { email, status, eta, respondedAt: new Date() } } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: "Alert not found" });
    }

    res.json({ success: true, alert: updated });
  } catch (err) {
    console.error("respond error", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ====== ADMIN: Donations ======

// Create a donation record for a user
app.post("/admin/donations", adminAuth, async (req, res) => {
  try {
    const { email, date, bloodBank, status } = req.body;
    if (!email || !date || !bloodBank) {
      return res.status(400).json({ success: false, message: "email, date, bloodBank are required" });
    }
    const d = await Donation.create({ email, date, bloodBank, status: status || "Scheduled" });
    res.json({ success: true, donation: d });
  } catch (err) {
    console.error("create donation error", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// List all donations (admin view)
app.get("/admin/donations", adminAuth, async (req, res) => {
  try {
    const donations = await Donation.find({}).sort({ date: -1 });
    res.json({ success: true, donations });
  } catch (err) {
    console.error("list donations error", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Update donation status
app.patch("/admin/donations/:id", adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const updated = await Donation.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    );
    res.json({ success: true, donation: updated });
  } catch (err) {
    console.error("update donation error", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Update user (name, blood, gender, age)
app.patch("/admin/users/:id", async (req, res) => {
  try {
    const allowed = (({ name, blood, gender, age }) => ({ name, blood, gender, age }))(req.body);
    const updated = await User.findByIdAndUpdate(req.params.id, { $set: allowed }, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, user: updated });
  } catch (err) {
    console.error("update user error", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Delete user
app.delete("/admin/users/:id", async (req, res) => {
  try {
    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("delete user error", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// DELETE donation
app.delete("/admin/donations/:id", async (req, res) => {
  try {
    const del = await Donation.findByIdAndDelete(req.params.id);
    if (!del) return res.status(404).json({ success:false, message:"Donation not found" });
    res.json({ success:true });
  } catch (err) {
    console.error("delete donation error", err);
    res.status(500).json({ success:false, message:"Server error" });
  }
});

// DELETE alert
app.delete("/admin/alerts/:id", async (req, res) => {
  try {
    const del = await Alert.findByIdAndDelete(req.params.id);
    if (!del) return res.status(404).json({ success:false, message:"Alert not found" });
    res.json({ success:true });
  } catch (err) {
    console.error("delete alert error", err);
    res.status(500).json({ success:false, message:"Server error" });
  }
});

// Delete a single response from an alert
app.delete("/admin/alerts/:id/responses", async (req, res) => {
  try {
    const { email, respondedAt } = req.body; // respondedAt optional
    if (!email) {
      return res.status(400).json({ success:false, message:"email is required" });
    }

    // Build a pull condition: always match by email; include respondedAt if provided
    const cond = { email };
    if (respondedAt) {
      const dt = new Date(respondedAt);
      if (!isNaN(dt)) cond.respondedAt = dt;
    }

    const updated = await Alert.findByIdAndUpdate(
      req.params.id,
      { $pull: { responses: cond } },
      { new: true }
    );

    if (!updated) return res.status(404).json({ success:false, message:"Alert not found" });
    res.json({ success:true });
  } catch (err) {
    console.error("delete response error", err);
    res.status(500).json({ success:false, message:"Server error" });
  }
});

/* ====== ADMIN REQUESTS ROUTES ====== */

// Create a request
// Body: { name, email, phone?, blood, units, neededBy, hospital, location, notes? }
app.post("/admin/requests", adminAuth, async (req, res) => {
  try {
    const { name, email, phone, blood, units, neededBy, hospital, location, notes } = req.body;
    if (!name || !email || !blood || !units || !neededBy || !hospital || !location) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }
    const doc = await Request.create({ name, email, phone, blood, units, neededBy, hospital, location, notes });
    res.json({ success: true, request: doc });
  } catch (err) {
    console.error("create request error", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// List requests (optional filter by status)
app.get("/admin/requests", adminAuth, async (req, res) => {
  try {
    const { status } = req.query;
    const q = {};
    if (status) q.status = status;
    const list = await Request.find(q).sort({ createdAt: 1 }); // oldest first
    res.json({ success: true, requests: list });
  } catch (err) {
    console.error("list requests error", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Paginated request history (7 at a time) – newest first
// Query: ?skip=<n>&limit=<m>
app.get("/admin/requests/history", adminAuth, async (req, res) => {
  try {
    const skip = Math.max(parseInt(req.query.skip || "0", 10), 0);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "7", 10), 1), 100);
    const list = await Request.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit);
    res.json({ success: true, requests: list });
  } catch (err) {
    console.error("history requests error", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Update request (status or fields)
app.patch("/admin/requests/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const update = { ...req.body };
    if (update.status === "Accepted") update.acceptedAt = new Date();
    if (update.status === "Rejected") update.rejectedAt = new Date();

    const doc = await Request.findByIdAndUpdate(id, update, { new: true });
    if (!doc) return res.status(404).json({ success: false, message: "Request not found" });
    res.json({ success: true, request: doc });
  } catch (err) {
    console.error("patch request error", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Accept shortcut
// Frontend will then call /admin/alert with group=req.blood to notify donors
app.patch("/admin/requests/:id/accept", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Request.findByIdAndUpdate(
      id,
      { status: "Accepted", acceptedAt: new Date() },
      { new: true }
    );
    if (!doc) return res.status(404).json({ success: false, message: "Request not found" });
    res.json({ success: true, request: doc });
  } catch (err) {
    console.error("accept request error", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Delete a request
app.delete("/admin/requests/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Request.findByIdAndDelete(id);
    if (!doc) return res.status(404).json({ success: false, message: "Request not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("delete request error", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
// ====== ADMIN: Inventory Management ======
// Inventory Create Route
app.post("/admin/inventory", adminAuth, async (req, res) => {
  try {
    const { hospital, bloodGroup, units, dateAdded } = req.body;
    if (!hospital || !bloodGroup || !units || !dateAdded) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }
    const entry = await Inventory.create({ hospital, bloodGroup, units, addedAt: dateAdded });
    res.json({ success: true, inventory: entry });
  } catch (err) {
    console.error("create inventory error", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
const { ObjectId } = require("mongodb");

app.put("/update-inventory", async (req, res) => {
  try {
    const { id, bloodGroup, units, hospital, type, donorId, receiverId, createdAt } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }

    await db.collection("inventory").updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          bloodGroup,
          units,
          hospital,
          type,
          donorId,
          receiverId,
          createdAt: createdAt || new Date(),
        },
      }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Update failed:", err);
    res.status(500).json({ error: "Update failed" });
  }
});


// Inventory Read/List Route
app.get("/admin/inventory", adminAuth, async (req, res) => {
  try {
    const items = await Inventory.find().sort({ dateAdded: -1 });
    res.json({ success: true, inventory: items });

  } catch (err) {
    console.error("list inventory error", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Inventory Delete Route
app.delete("/admin/inventory/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Inventory.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Inventory item not found" });
    }

    res.json({ success: true });

  } catch (err) {
    console.error("delete inventory error", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
// Update blood entry by ID
app.put("/update/:id", async (req, res) => {
  const { id } = req.params;
  const updatedData = req.body;

  try {
    const updated = await bloodCollection.findByIdAndUpdate(id, updatedData, { new: true });

    if (!updated) {
      return res.status(404).json({ error: "Entry not found" });
    }

    res.status(200).json({ message: "Entry updated successfully", updated });
  } catch (err) {
    console.error("Error updating entry:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

// Update blood entry by ID
app.put("/update/:id", async (req, res) => {
  const { id } = req.params;
  const updatedData = req.body;

  try {
    const updated = await bloodCollection.findByIdAndUpdate(id, updatedData, { new: true });

    if (!updated) {
      return res.status(404).json({ error: "Entry not found" });
    }

    res.status(200).json({ message: "Entry updated successfully", updated });
  } catch (err) {
    console.error("Error updating entry:", err);
    res.status(500).json({ error: "Update failed" });
  }
});
// ✅ Updated route for Inventory update (matches your schema)
app.put("/api/inventory/:id", async (req, res) => {
  const { id } = req.params;
  const { hospital, bloodGroup, units, addedAt } = req.body;

  try {
    const updatedInventory = await Inventory.findByIdAndUpdate(
      id,
      {
        hospital,
        bloodGroup,
        units,
        // Use provided 'addedAt' if available, else don't change existing value
        ...(addedAt && { addedAt }),
      },
      { new: true, runValidators: true }
    );

    if (!updatedInventory) {
      return res.status(404).json({ error: "Inventory entry not found" });
    }

    res.json({ success: true, inventory: updatedInventory });
  } catch (error) {
    console.error("Update failed:", error.message);
    res.status(500).json({ error: "Update failed" });
  }
});


/* ====== DONOR ====== */

// Donor fetch their own donation history
app.get("/donations/:email", async (req, res) => {
  try {
    const donations = await Donation.find({ email: req.params.email }).sort({ date: -1 });
    res.json({ success: true, donations });
  } catch (err) {
    console.error("user donations error", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ====== UTIL: Create default admin if missing (uses .env) ====== */
async function ensureDefaultAdmin() {
  try {
    const email = process.env.ADMIN_EMAIL || "admin@bloodlink.com";
    const plain = process.env.ADMIN_PASSWORD || "admin123";

    let admin = await Admin.findOne({ email });
    if (!admin) {
      const passwordHash = await bcrypt.hash(plain, 10);
      admin = await Admin.create({ email, passwordHash });
      console.log(`👑 Default admin created: ${email}`);
    } else {
      // Optional: if you change ADMIN_PASSWORD in .env, uncomment to update hash on start
      // const passwordHash = await bcrypt.hash(plain, 10);
      // await Admin.updateOne({ email }, { $set: { passwordHash } });
      // console.log(`🔑 Admin password updated for: ${email}`);
      console.log(`👑 Admin exists: ${email}`);
    }
  } catch (e) {
    console.error("ensureDefaultAdmin error:", e);
  }
}
