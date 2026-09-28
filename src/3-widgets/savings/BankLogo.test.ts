import { describe, expect, it } from 'vitest'
import { getBankLogo } from './BankLogo'

describe('getBankLogo', () => {
  it.each([
    'Т-Банк',
    'Тинькофф Банк',
    'Альфа-Банк',
    'Сбербанк',
    'Сбербанк России',
    'Банк ВТБ',
    'ВТБ',
    'Озон Банк',
    'Ozon Банк',
    'Ozon.Card',
    'Яндекс Банк',
    'Yandex Bank',
  ])('finds a logo for %s', title => {
    expect(getBankLogo(title)).not.toBeNull()
  })

  it.each([
    'Сберинвестбанк',
    'Сберкред Банк',
    'РИТ-банк',
    'ЮMoney (Яндекс.Деньги)',
  ])('leaves %s with a letter', title => {
    expect(getBankLogo(title)).toBeNull()
  })
})
