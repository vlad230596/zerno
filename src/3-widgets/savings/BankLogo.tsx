import React, { FC } from 'react'
import { Box } from '@mui/material'
import tbank from '6-shared/assets/banks/tbank.svg'
import alfa from '6-shared/assets/banks/alfa.svg'
import sber from '6-shared/assets/banks/sber.svg'
import vtb from '6-shared/assets/banks/vtb.svg'
import ozon from '6-shared/assets/banks/ozon.svg'
import yandex from '6-shared/assets/banks/yandex.svg'
import { Initial } from './Initial'

/**
 * Logos of the main banks, matched by the title ZenMoney gives the company.
 * The order matters: "Сбербанк" must not catch "Сберинвестбанк" and the like,
 * so each pattern is anchored to the start of the title.
 */
const LOGOS: [RegExp, string][] = [
  [/^(т-банк|тинькофф)/i, tbank],
  [/^альфа-банк/i, alfa],
  [/^сбер(банк)?( россии)?$/i, sber],
  [/^(банк )?втб/i, vtb],
  // Older dictionaries call it "Ozon.Card"
  [/^(озон|ozon)[ .-]?(банк|bank|card)/i, ozon],
  [/^(яндекс|yandex)[ .-]?(банк|bank)/i, yandex],
]

export function getBankLogo(title: string): string | null {
  const t = title.trim()
  return LOGOS.find(([re]) => re.test(t))?.[1] ?? null
}

export const BankLogo: FC<{ title: string; size: number }> = ({
  title,
  size,
}) => {
  const src = getBankLogo(title)
  if (!src) return <Initial text={title} size={size} />
  return (
    <Box
      component="img"
      src={src}
      alt=""
      aria-hidden
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        display: 'block',
        // White logos need an edge on the white card
        boxShadow: theme => `0 0 0 1px ${theme.palette.divider}`,
      }}
    />
  )
}
