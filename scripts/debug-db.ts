import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugDatabase() {
  try {
    console.log('Checking expenses table...');
    const expenses = await prisma.$queryRaw`
      SELECT id, title, description, category, amount, paymentMethod, 
             paidTo, paidBy, expenseDate, attachment, tags, notes, currency, 
             createdBy, createdAt, updatedAt, paidById, paidToId,
             paidToContractorId, paidByContractorId
      FROM Expense
      LIMIT 10
    `;
    console.log('Expenses:', JSON.stringify(expenses, null, 2));

    console.log('\nChecking users table...');
    const users = await prisma.$queryRaw`
      SELECT id, email, name, password, role, avatar, createdAt, updatedAt
      FROM User
      LIMIT 10
    `;
    console.log('Users:', JSON.stringify(users, null, 2));

    console.log('\nChecking for null bytes or invalid characters in expenses...');
    const expensesWithIssues = await prisma.$queryRaw`
      SELECT id, title, description, tags, notes
      FROM Expense
      WHERE title LIKE '%' || CHAR(0) || '%'
         OR description LIKE '%' || CHAR(0) || '%'
         OR tags LIKE '%' || CHAR(0) || '%'
         OR notes LIKE '%' || CHAR(0) || '%'
    `;
    console.log('Expenses with null bytes:', expensesWithIssues);

    console.log('\nChecking for null bytes or invalid characters in users...');
    const usersWithIssues = await prisma.$queryRaw`
      SELECT id, email, name, avatar
      FROM User
      WHERE email LIKE '%' || CHAR(0) || '%'
         OR name LIKE '%' || CHAR(0) || '%'
         OR avatar LIKE '%' || CHAR(0) || '%'
    `;
    console.log('Users with null bytes:', usersWithIssues);

  } catch (error) {
    console.error('Debug error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugDatabase();
