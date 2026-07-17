import {
  getKids, addKid, addTemplate, addBoardChore,
} from "../lib/domain.js";

if (getKids().length > 0) {
  console.log("Already seeded (kids exist). Skipping.");
  process.exit(0);
}

// Placeholder kids — rename in Parent → Admin. (ages: 12, 10.5, 4.5)
const a = addKid({ name: "Kid A", emoji: "🦊", color: "#e07a5f" }); // 12
const b = addKid({ name: "Kid B", emoji: "🐼", color: "#3d9970" }); // 10.5
const c = addKid({ name: "Kid C", emoji: "🐨", color: "#5b8def" }); // 4.5

// Recurring (daily) chores
addTemplate({ name: "Read", emoji: "📚", points: 10, kidIds: [a, b, c] });
addTemplate({ name: "Make bed", emoji: "🛏️", points: 3, kidIds: [a, b, c] });
addTemplate({ name: "Brush teeth (AM+PM)", emoji: "🪥", points: 2, kidIds: [a, b, c] });
addTemplate({ name: "Tidy room", emoji: "🧸", points: 5, kidIds: [a, b] });

// Board (claimable one-offs)
addBoardChore({ name: "Unload dishwasher", emoji: "🍽️", points: 5 });
addBoardChore({ name: "Walk the dog", emoji: "🐕", points: 8 });
addBoardChore({ name: "Fold laundry", emoji: "🧺", points: 6 });

console.log("Seeded 3 kids, 4 recurring chores, 3 board chores.");
console.log("Parent PIN: 1234 (change in Admin).");
