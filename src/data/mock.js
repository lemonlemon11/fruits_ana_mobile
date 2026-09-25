import { avgPrice } from '../utils/format'

export const mockUser = {
  displayName: '果农小王',
  role: '果农',
  merchantNo: '637',
}

const gradeOrder = ['A', 'B', 'C']

const seed = [
  {
    id: 's001',
    merchantNo: '637',
    orderNo: '宝贝-001',
    brand: '宝贝',
    series: '宝贝',
    fruitType: '榴莲',
    containerNo: 'L011',
    vehicleNo: 'RXRK03',
    arrivalDate: '2026-08-27',
    saleDateStart: '2026-08-27',
    saleDateEnd: '2026-09-02',
    confirmedAt: '2026-09-03 10:20',
    grades: {
      A: { quantity: 325, amount: 155850 },
      B: { quantity: 524, amount: 217790 },
      C: { quantity: 124, amount: 38600 },
    },
    feeAmount: 6800,
    customsTax: 3200,
  },
  {
    id: 's002',
    merchantNo: '624',
    orderNo: '宝贝-002',
    brand: '宝贝',
    series: '宝贝',
    fruitType: '榴莲',
    containerNo: 'L012',
    vehicleNo: 'RXRK04',
    arrivalDate: '2026-08-28',
    saleDateStart: '2026-08-28',
    saleDateEnd: '2026-09-03',
    confirmedAt: '2026-09-04 09:40',
    grades: {
      A: { quantity: 340, amount: 180030 },
      B: { quantity: 386, amount: 164370 },
      C: { quantity: 248, amount: 87900 },
    },
    feeAmount: 7600,
    customsTax: 3400,
  },
  {
    id: 's003',
    merchantNo: '641',
    orderNo: '宝贝-003',
    brand: '宝贝',
    series: '宝贝',
    fruitType: '榴莲',
    containerNo: 'L013',
    vehicleNo: 'RXRK05',
    arrivalDate: '2026-09-05',
    saleDateStart: '2026-09-05',
    saleDateEnd: '2026-09-09',
    confirmedAt: '2026-09-10 15:12',
    grades: {
      A: { quantity: 248, amount: 133880 },
      B: { quantity: 406, amount: 186260 },
      C: { quantity: 246, amount: 86430 },
    },
    feeAmount: 7100,
    customsTax: 3600,
  },
  {
    id: 's004',
    merchantNo: '618',
    orderNo: '宝贝-004',
    brand: '宝贝',
    series: '宝贝',
    fruitType: '榴莲',
    containerNo: 'L014',
    vehicleNo: 'RXRK06',
    arrivalDate: '2026-09-12',
    saleDateStart: '2026-09-12',
    saleDateEnd: '2026-09-17',
    confirmedAt: '2026-09-18 11:05',
    grades: {
      A: { quantity: 302, amount: 171300 },
      B: { quantity: 428, amount: 198060 },
      C: { quantity: 182, amount: 65820 },
    },
    feeAmount: 8300,
    customsTax: 3800,
  },
  {
    id: 's005',
    merchantNo: '645',
    orderNo: '宝贝-005',
    brand: '宝贝',
    series: '宝贝',
    fruitType: '榴莲',
    containerNo: 'L015',
    vehicleNo: 'RXRK07',
    arrivalDate: '2026-09-18',
    saleDateStart: '2026-09-18',
    saleDateEnd: '2026-09-23',
    confirmedAt: '2026-09-24 16:30',
    grades: {
      A: { quantity: 366, amount: 198500 },
      B: { quantity: 421, amount: 190240 },
      C: { quantity: 199, amount: 67960 },
    },
    feeAmount: 7900,
    customsTax: 4100,
  },
  {
    id: 's006',
    merchantNo: '653',
    orderNo: '宝贝-006',
    brand: '宝贝',
    series: '宝贝',
    fruitType: '榴莲',
    containerNo: 'L016',
    vehicleNo: 'RXRK08',
    arrivalDate: '2026-09-21',
    saleDateStart: '2026-09-21',
    saleDateEnd: '2026-09-26',
    confirmedAt: '2026-09-27 10:00',
    grades: {
      A: { quantity: 380, amount: 206500 },
      B: { quantity: 448, amount: 202000 },
      C: { quantity: 182, amount: 60400 },
    },
    feeAmount: 8500,
    customsTax: 4200,
  },
]

const specMap = {
  A: '5-6斤/箱',
  B: '4-5斤/箱',
  C: '3-4斤/箱',
}

function buildRecords(item) {
  return gradeOrder
    .filter((grade) => item.grades[grade]?.quantity)
    .map((grade) => {
      const row = item.grades[grade]
      const unitPrice = avgPrice(row.amount, row.quantity)
      return {
        id: `${item.id}-${grade}`,
        saleDate: item.saleDateStart,
        fruitType: item.fruitType,
        specRaw: specMap[grade],
        gradeRaw: grade,
        grade,
        headCount: '12柜',
        quantity: row.quantity,
        unitPrice,
        amount: row.amount,
        remark: '',
        salesRegion: '嘉兴水果市场',
      }
    })
}

export const settlements = seed.map((item) => {
  const totalQuantity = gradeOrder.reduce(
    (sum, grade) => sum + (item.grades[grade]?.quantity ?? 0),
    0,
  )
  const salesAmount = gradeOrder.reduce(
    (sum, grade) => sum + (item.grades[grade]?.amount ?? 0),
    0,
  )
  const averagePrice = avgPrice(salesAmount, totalQuantity)
  const goodsAmount = salesAmount
  const afterSalesAmount = Math.round(goodsAmount * 0.965)
  const payableAmount = afterSalesAmount - item.feeAmount - item.customsTax

  const grades = gradeOrder
    .filter((grade) => item.grades[grade]?.quantity)
    .map((grade) => {
      const row = item.grades[grade]
      return {
        grade,
        salesQuantity: row.quantity,
        salesAmount: row.amount,
        weightedAvgPrice: avgPrice(row.amount, row.quantity),
        quantityShare: totalQuantity ? row.quantity / totalQuantity : null,
      }
    })

  return {
    ...item,
    merchantNoNormalized: item.merchantNo,
    orderNoNormalized: item.orderNo,
    totalQuantity,
    salesAmount,
    averagePrice,
    gradeQuantities: gradeOrder.reduce((map, grade) => {
      map[grade] = item.grades[grade]?.quantity ?? 0
      return map
    }, {}),
    grades,
    recordCount: gradeOrder.filter((grade) => item.grades[grade]?.quantity).length,
    settlement: {
      goodsAmount,
      afterSalesAmount,
      feeAmount: item.feeAmount,
      customsTax: item.customsTax,
      payableAmount,
    },
    records: buildRecords(item),
  }
})

export function getSettlements() {
  return settlements
}

export function getSettlementById(id) {
  return settlements.find((item) => item.id === id) ?? null
}

export function getOverview() {
  const totalQuantity = settlements.reduce((sum, item) => sum + item.totalQuantity, 0)
  const salesAmount = settlements.reduce((sum, item) => sum + item.salesAmount, 0)
  const averagePrice = avgPrice(salesAmount, totalQuantity)

  const gradeMap = new Map()
  settlements.forEach((item) => {
    item.grades.forEach((row) => {
      const current = gradeMap.get(row.grade) ?? {
        grade: row.grade,
        salesQuantity: 0,
        salesAmount: 0,
      }
      current.salesQuantity += row.salesQuantity
      current.salesAmount += row.salesAmount
      gradeMap.set(row.grade, current)
    })
  })

  const grades = gradeOrder
    .filter((grade) => gradeMap.has(grade))
    .map((grade) => {
      const row = gradeMap.get(grade)
      return {
        ...row,
        weightedAvgPrice: avgPrice(row.salesAmount, row.salesQuantity),
        quantityShare: totalQuantity ? row.salesQuantity / totalQuantity : null,
      }
    })

  return {
    totalQuantity,
    salesAmount,
    averagePrice,
    settlementCount: settlements.length,
    grades,
    anomalies: [
      {
        type: '平均售价偏低',
        reason: 'A果均价低于近 7 日同品牌均值约 4.2%',
        merchantNo: '637',
        orderNo: '宝贝-001',
      },
    ],
  }
}

export function getSeriesOptions() {
  return settlements
}
