const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'db/custom.db'), { readonly: false });

// Get all expense data
const expenses = db.prepare('SELECT * FROM Expense').all();

console.log('Current expense records:');
console.log(JSON.stringify(expenses, null, 2));

// Fix expenseDate format - convert to ISO 8601
const update = db.prepare('UPDATE Expense SET expenseDate = ? WHERE id = ?');

expenses.forEach((expense) => {
  if (expense.expenseDate) {
    // Try to parse and convert to ISO format
    let dateStr = expense.expenseDate;
    
    // If it's not already in ISO format, try to convert it
    if (!dateStr.includes('T') && !dateStr.includes('Z')) {
      // Assume it's in YYYY-MM-DD format
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        const isoDate = date.toISOString();
        console.log(`Converting ${dateStr} to ${isoDate} for expense ${expense.id}`);
        update.run(isoDate, expense.id);
      }
    }
  }
});

// Check the results
const fixedExpenses = db.prepare('SELECT * FROM Expense').all();
console.log('\nFixed expense records:');
console.log(JSON.stringify(fixedExpenses, null, 2));

db.close();
