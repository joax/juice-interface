import { t, Trans } from '@lingui/macro'
import { Modal, Space } from 'antd'
import CurrencySymbol from 'components/shared/CurrencySymbol'
import InputAccessoryButton from 'components/shared/InputAccessoryButton'
import FormattedNumberInput from 'components/shared/inputs/FormattedNumberInput'

import { NetworkContext } from 'contexts/networkContext'
import { ProjectContext } from 'contexts/projectContext'
import { ThemeContext } from 'contexts/themeContext'
import { UserContext } from 'contexts/userContext'
import { BigNumber } from 'ethers'
import useContractReader from 'hooks/ContractReader'
import { useRedeemRate } from 'hooks/RedeemRate'
import { CSSProperties, useContext, useMemo, useState } from 'react'
import { bigNumbersDiff } from 'utils/bigNumbersDiff'
import { formattedNum, formatWad, fromWad, parseWad } from 'utils/formatNumber'
import { decodeFundingCycleMetadata } from 'utils/fundingCycle'

import { CURRENCY_ETH, CURRENCY_USD } from 'constants/currency'

export default function RedeemModal({
  visible,
  redeemDisabled,
  onOk,
  onCancel,
  totalBalance,
}: {
  visible?: boolean
  redeemDisabled?: boolean
  onOk: VoidFunction | undefined
  onCancel: VoidFunction | undefined
  totalBalance: BigNumber | undefined
}) {
  const [redeemAmount, setRedeemAmount] = useState<string>()
  const [loading, setLoading] = useState<boolean>()

  const {
    theme: { colors },
  } = useContext(ThemeContext)
  const { userAddress } = useContext(NetworkContext)
  const { contracts, transactor } = useContext(UserContext)
  const { projectId, tokenSymbol, currentFC, terminal } =
    useContext(ProjectContext)

  const fcMetadata = decodeFundingCycleMetadata(currentFC?.metadata)

  const maxClaimable = useContractReader<BigNumber>({
    contract: terminal?.name,
    functionName: 'claimableOverflowOf',
    args:
      userAddress && projectId
        ? [userAddress, projectId.toHexString(), totalBalance?.toHexString()]
        : null,
    valueDidChange: bigNumbersDiff,
    updateOn: useMemo(
      () =>
        projectId && userAddress
          ? [
              {
                contract: terminal?.name,
                eventName: 'Pay',
                topics: [[], projectId.toHexString(), userAddress],
              },
              {
                contract: terminal?.name,
                eventName: 'Redeem',
                topics: [projectId.toHexString(), userAddress],
              },
            ]
          : undefined,
      [projectId, userAddress, terminal?.name],
    ),
  })

  const rewardAmount = useRedeemRate({
    tokenAmount: redeemAmount,
    fundingCycle: currentFC,
  })

  // 0.5% slippage for USD-denominated projects
  const minAmount = currentFC?.currency.eq(CURRENCY_USD)
    ? rewardAmount?.mul(1000).div(1005)
    : rewardAmount

  function redeem() {
    if (!transactor || !contracts || !rewardAmount || !terminal) return

    setLoading(true)

    const redeemWad = parseWad(redeemAmount)

    if (!redeemWad || !projectId) return

    transactor(
      terminal.version === '1.1'
        ? contracts.TerminalV1_1
        : contracts.TerminalV1,
      'redeem',
      [
        userAddress,
        projectId.toHexString(),
        redeemWad.toHexString(),
        minAmount,
        userAddress,
        false, // TODO preferconverted
      ],
      {
        onConfirmed: () => setRedeemAmount(undefined),
        onDone: () => setLoading(false),
      },
    )
  }

  const statsStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  }

  return (
    <Modal
      title={`Burn ${tokenSymbol ? tokenSymbol + ' tokens' : 'tokens'} for ETH`}
      visible={visible}
      confirmLoading={loading}
      onOk={() => {
        redeem()

        if (onOk) onOk()
      }}
      onCancel={() => {
        setRedeemAmount(undefined)

        if (onCancel) onCancel()
      }}
      okText={`Burn ${formattedNum(redeemAmount, {
        precision: 2,
      })} ${tokenSymbol ?? 'tokens'} for ETH`}
      okButtonProps={{
        disabled:
          redeemDisabled || !redeemAmount || parseInt(redeemAmount) === 0,
      }}
      width={540}
      centered
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <div>
          <p style={statsStyle}>
            <Trans>Bonding curve:</Trans>{' '}
            <span>
              {fcMetadata?.bondingCurveRate !== undefined
                ? fcMetadata.bondingCurveRate / 2
                : '--'}
              %
            </span>
          </p>
          {/* <p style={statsStyle}>
            Burn rate:{' '}
            <span>
              {redeemRate && !redeemRate.isZero()
                ? formattedNum(parseWad(1).div(redeemRate))
                : '--'}{' '}
              {tokenSymbol ?? 'tokens'}/ETH
            </span>
          </p> */}
          <p style={statsStyle}>
            {tokenSymbol ?? 'Token'} balance:{' '}
            <span>
              {formatWad(totalBalance ?? 0, { precision: 0 })}{' '}
              {tokenSymbol ?? 'tokens'}
            </span>
          </p>
          <p style={statsStyle}>
            <Trans>
              Currently worth:{' '}
              <span>
                <CurrencySymbol currency={CURRENCY_ETH} />
                {formatWad(maxClaimable, { precision: 4 })}
              </span>
            </Trans>
          </p>
        </div>
        <p>
          <Trans>
            Tokens can be redeemed for a portion of this project's ETH overflow,
            according to the bonding curve rate of the current funding cycle.
          </Trans>{' '}
          <span style={{ fontWeight: 500, color: colors.text.warn }}>
            <Trans>Tokens are burned when they are redeemed.</Trans>
          </span>
        </p>
        {redeemDisabled && (
          <div style={{ color: colors.text.secondary, fontWeight: 500 }}>
            <Trans>You can redeem tokens once this project has overflow.</Trans>
          </div>
        )}
        {!redeemDisabled && (
          <div>
            <FormattedNumberInput
              min={0}
              step={0.001}
              placeholder="0"
              value={redeemAmount}
              disabled={redeemDisabled}
              accessory={
                <InputAccessoryButton
                  content={t`MAX`}
                  onClick={() => setRedeemAmount(fromWad(totalBalance))}
                />
              }
              onChange={val => setRedeemAmount(val)}
            />
            <div style={{ fontWeight: 500, marginTop: 20 }}>
              <Trans>
                You will receive{' '}
                {currentFC?.currency.eq(CURRENCY_USD) ? 'minimum ' : ' '}
                {formatWad(minAmount, { precision: 8 }) || '--'} ETH
              </Trans>
            </div>
          </div>
        )}
      </Space>
    </Modal>
  )
}
