const express = require('express')
const router = express.Router()
const { prisma } = require('../lib/prisma')

// 1) 조회: 특정 말소건 상세 (GET /api/vehicle-case/:id)
router.get('/:id', async (req, res) => {
  try {
    const row = await prisma.vehicleCase.findUnique({
      where: { id: req.params.id },
      include: { documents: true }
    })
    if (!row) return res.status(404).json({ ok:false, message:'Not found' })
    res.json({ ok:true, data: row })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok:false })
  }
})

// 2) 상태 변경: (PATCH /api/vehicle-case/:id/status)
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, memo } = req.body
    // 가벼운 검증: 허용 enum만
    const allowed = ['RECEIVED','NEED_MORE_DOCS','COMPLETED']
    if (!allowed.includes(status)) return res.status(400).json({ ok:false, message:'Invalid status' })

    const row = await prisma.vehicleCase.update({
      where: { id: req.params.id },
      data: {
        status,
        completedAt: status === 'COMPLETED' ? new Date() : null
      }
    })

    // (선택) 상태 변경 로그 남기고 싶다면 VehicleLog 테이블로 확장

    res.json({ ok:true, data: row })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok:false })
  }
})

module.exports = router
