// 공용 Prisma 인스턴스
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
module.exports = { prisma }
