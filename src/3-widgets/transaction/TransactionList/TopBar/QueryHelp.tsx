import { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { Box, Popover, PopoverProps, Typography } from '@mui/material'

type QueryHelpProps = PopoverProps & {
  onInsert: (chunk: string) => void
}

/** Cheat sheet for the search syntax. Examples are clickable */
export const QueryHelp: FC<QueryHelpProps> = ({ onInsert, ...rest }) => {
  const { t } = useTranslation('transactionSearch')

  const rows: Array<{ example: string; description: string }> = [
    { example: t('exampleTag'), description: t('helpTag') },
    { example: t('exampleNoTag'), description: t('helpNoTag') },
    { example: t('examplePayee'), description: t('helpPayee') },
    { example: t('exampleAccount'), description: t('helpAccount') },
    { example: '>1000', description: t('helpAmountMore') },
    { example: '100..500', description: t('helpAmountRange') },
    { example: '2024-05', description: t('helpMonth') },
    { example: '2024-01..2024-06', description: t('helpDateRange') },
    { example: t('exampleMonthKeyword'), description: t('helpCurrentMonth') },
    { example: '30d', description: t('helpLastDays') },
    { example: t('keywordOutcome'), description: t('helpType') },
    { example: t('keywordTransfer'), description: t('helpTransfers') },
    { example: t('keywordNew'), description: t('helpNew') },
    { example: t('exampleComment'), description: t('helpComment') },
    { example: t('examplePhrase'), description: t('helpPhrase') },
    { example: t('exampleId'), description: t('helpId') },
  ]

  return (
    <Popover
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      {...rest}
    >
      <Box sx={{ p: 2, maxWidth: 380 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          {t('helpTitle')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('helpIntro')}
        </Typography>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            columnGap: 2,
            rowGap: 1,
            alignItems: 'baseline',
          }}
        >
          {rows.map(row => (
            <Box key={row.example} sx={{ display: 'contents' }}>
              <Box
                component="button"
                onClick={() => onInsert(row.example)}
                sx={{
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  px: 0.75,
                  py: 0.25,
                  borderRadius: 1,
                  fontFamily: 'monospace',
                  fontSize: '0.8125rem',
                  color: 'text.primary',
                  bgcolor: 'action.hover',
                  '&:hover': { bgcolor: 'action.selected' },
                }}
              >
                {row.example}
              </Box>
              <Typography variant="body2" color="text.secondary">
                {row.description}
              </Typography>
            </Box>
          ))}
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {t('helpLogic')}
        </Typography>
      </Box>
    </Popover>
  )
}
