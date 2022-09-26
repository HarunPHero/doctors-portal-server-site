const express = require("express");
const app = express();
const port = process.env.PORT || 5000;
const jwt = require("jsonwebtoken");
require("dotenv").config();
const cors = require("cors");
//cors
app.use(cors());
app.use(express.json());
//mongodb

const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.fpuk9oh.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "unAthorized access" });
  }

  //verify token
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "FORBIDDEN ACCESS" });
    }
    req.decoded = decoded;

    next();
  });
}
async function run() {
  try {
    await client.connect();
    const ServiceCollection = client
      .db("doctors-portal")
      .collection("services");
    const BookingCollection = client.db("doctors-portal").collection("booking");
    const UsersCollection = client.db("doctors-portal").collection("users");
    app.get("/services", async (req, res) => {
      const query = {};
      const cursor = ServiceCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });
    app.get("/available", async (req, res) => {
      const date = req.query.date;

      // step 1:  get all services
      const services = await ServiceCollection.find().toArray();

      // step 2: get the booking of that day. output: [{}, {}, {}, {}, {}, {}]
      const query = { date: date };
      const bookings = await BookingCollection.find(query).toArray();

      // step 3: for each service
      services.forEach((service) => {
        // step 4: find bookings for that service. output: [{}, {}, {}, {}]
        const serviceBookings = bookings.filter(
          (book) => book.treatment === service.name
        );
        // step 5: select slots for the service Bookings: ['', '', '', '']
        const bookedSlots = serviceBookings.map((book) => book.slot);

        const available = service.slots.filter((s) => !bookedSlots.includes(s));
        service.slots = available;
      });
      res.send(services);
    });
    app.get("/booking", verifyJWT, async (req, res) => {
      const uid = req.query.uid;
      const decodedUid = req.decoded.uid;
      if (uid === decodedUid) {
        const query = { uid: uid };
        const result = await BookingCollection.find(query).toArray();
        res.send(result);
      } else {
        return res.status(403).send({ message: "FORBIDDEN ACCESS" });
      }
    });
    app.get("/patients", verifyJWT, async (req, res) => {
      const query = {};
      const cursor = UsersCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });
    //insert a booking
    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const query = {
        treatment: booking.treatment,
        date: booking.date,
        patient: booking.patient,
      };
      const exists = await BookingCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, booking: exists });
      }
      const result = await BookingCollection.insertOne(booking);
      return res.send({ success: true, result });
    });

    app.get("/admin/:uid",verifyJWT, async (req, res) => {
      const uid = req.params.uid;
      const user = await UsersCollection.findOne({ uid: uid });
      const isAdmin = user?.role === "admin";
      res.send({ admin: isAdmin });
      
    });
    app.put("/user/admin/:uid", verifyJWT, async (req, res) => {
      const uid = req.params.uid;
      const requester = req.decoded.uid;
      const requesterAccount = await UsersCollection.findOne({
        uid: requester,
      });
      if (requesterAccount.role === "admin") {
        const filter = { uid: uid };
        const updateDoc = {
          $set: { role: "admin" },
        };
        const result = await UsersCollection.updateOne(filter, updateDoc);
        res.send(result);
      } else {
        return res.status(403).send({ message: "FORBIDDEN" });
      }
    });
    app.put("/user/:uid", async (req, res) => {
      const uid = req.params.uid;
      const user = req.body;
      const filter = { uid: uid };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await UsersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      const token = jwt.sign({ uid: uid }, process.env.ACCESS_TOKEN_SECRET);
      res.send({ result, accessToken: token });
    });
  } finally {
  }
}
run().catch(console.dir);
app.get("/", (req, res) => {
  res.send("Hello from my doctors portal server site!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
