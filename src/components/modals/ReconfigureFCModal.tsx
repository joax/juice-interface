import { CaretRightFilled } from '@ant-design/icons'
import { BigNumber } from '@ethersproject/bignumber'
import { t, Trans } from '@lingui/macro'
import { Drawer, DrawerProps, Space, Statistic } from 'antd'
import { useForm } from 'antd/lib/form/Form'
import Modal from 'antd/lib/modal/Modal'
import RestrictedActionsForm, {
  RestrictedActionsFormFields,
} from 'components/Create/RestrictedActionsForm'
import RulesForm from 'components/Create/RulesForm'
import CurrencySymbol from 'components/shared/CurrencySymbol'
import PayoutModsList from 'components/shared/PayoutModsList'
import TicketModsList from 'components/shared/TicketModsList'

import { ProjectContext } from 'contexts/projectContext'
import { ThemeContext } from 'contexts/themeContext'
import { UserContext } from 'contexts/userContext'
import { constants } from 'ethers'
import { useAppDispatch } from 'hooks/AppDispatch'
import { useEditingFundingCycleSelector } from 'hooks/AppSelector'
import { useTerminalFee } from 'hooks/TerminalFee'
import { CurrencyOption } from 'models/currency-option'
import { FundingCycle } from 'models/funding-cycle'
import { FundingCycleMetadata } from 'models/funding-cycle-metadata'
import { FCProperties } from 'models/funding-cycle-properties'
import { PayoutMod, TicketMod } from 'models/mods'
import { useCallback, useContext, useLayoutEffect, useState } from 'react'
import { editingProjectActions } from 'redux/slices/editingProject'
import {
  formattedNum,
  formatWad,
  fromPerbicent,
  fromPermille,
  fromWad,
} from 'utils/formatNumber'
import {
  decodeFundingCycleMetadata,
  hasFundingTarget,
  isRecurring,
} from 'utils/fundingCycle'
import { amountSubFee } from 'utils/math'
import { serializeFundingCycle } from 'utils/serializers'

import { getBallotStrategyByAddress } from 'constants/ballotStrategies/getBallotStrategiesByAddress'

import BudgetForm from '../Create/BudgetForm'
import IncentivesForm from '../Create/IncentivesForm'
import PayModsForm from '../Create/PayModsForm'
import TicketingForm, { TicketingFormFields } from '../Create/TicketingForm'

export default function ReconfigureFCModal({
  fundingCycle,
  projectId,
  visible,
  onDone,
  payoutMods,
  ticketMods,
}: {
  visible?: boolean
  fundingCycle: FundingCycle | undefined
  projectId: BigNumber | undefined
  payoutMods: PayoutMod[] | undefined
  ticketMods: TicketMod[] | undefined
  onDone?: VoidFunction
}) {
  const { transactor, contracts } = useContext(UserContext)
  const { colors, radii } = useContext(ThemeContext).theme
  const [currentStep, setCurrentStep] = useState<number>()
  const [payModsModalVisible, setPayModsFormModalVisible] =
    useState<boolean>(false)
  const [budgetFormModalVisible, setBudgetFormModalVisible] =
    useState<boolean>(false)
  const [rulesFormModalVisible, setRulesFormModalVisible] =
    useState<boolean>(false)
  const [incentivesFormModalVisible, setIncentivesFormModalVisible] =
    useState<boolean>(false)
  const [ticketingFormModalVisible, setTicketingFormModalVisible] =
    useState<boolean>(false)
  const [
    restrictedActionsFormModalVisible,
    setRestrictedActionsFormModalVisible,
  ] = useState<boolean>(false)
  useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>()
  const [ticketingForm] = useForm<TicketingFormFields>()
  const [restrictedActionsForm] = useForm<RestrictedActionsFormFields>()
  const [editingPayoutMods, setEditingPayoutMods] = useState<PayoutMod[]>([])
  const [editingTicketMods, setEditingTicketMods] = useState<TicketMod[]>([])
  const dispatch = useAppDispatch()
  const { currentFC, terminal, isPreviewMode } = useContext(ProjectContext)
  const editingFC = useEditingFundingCycleSelector()
  const terminalFee = useTerminalFee(terminal?.version)

  const resetTicketingForm = () =>
    ticketingForm.setFieldsValue({
      reserved: parseFloat(fromPerbicent(editingFC?.reserved)),
    })

  const fcMetadata: FundingCycleMetadata | undefined =
    decodeFundingCycleMetadata(currentFC?.metadata)

  const resetRestrictedActionsForm = () => {
    if (fcMetadata?.version === 1) {
      restrictedActionsForm.setFieldsValue({
        payIsPaused: fcMetadata?.payIsPaused,
        ticketPrintingIsAllowed: fcMetadata?.ticketPrintingIsAllowed,
      })
    }
  }

  const onPayModsFormSaved = (mods: PayoutMod[]) => setEditingPayoutMods(mods)

  const onBudgetFormSaved = (
    currency: CurrencyOption,
    target: string,
    duration: string,
  ) => {
    dispatch(editingProjectActions.setTarget(target))
    dispatch(editingProjectActions.setDuration(duration))
    dispatch(editingProjectActions.setCurrency(currency))
  }

  const onTicketingFormSaved = (mods: TicketMod[]) => {
    const fields = ticketingForm.getFieldsValue(true)
    dispatch(editingProjectActions.setReserved(fields.reserved))
    setEditingTicketMods(mods)
  }

  const onRestrictedActionsFormSaved = () => {
    const fields = restrictedActionsForm.getFieldsValue(true)
    dispatch(
      editingProjectActions.setticketPrintingIsAllowed(
        fields.ticketPrintingIsAllowed,
      ),
    )
    dispatch(editingProjectActions.setPayIsPaused(fields.payIsPaused))
  }

  const onRulesFormSaved = (ballot: string) => {
    dispatch(editingProjectActions.setBallot(ballot))
  }

  const onIncentivesFormSaved = (
    discountRate: string,
    bondingCurveRate: string,
  ) => {
    dispatch(editingProjectActions.setDiscountRate(discountRate))
    dispatch(editingProjectActions.setBondingCurveRate(bondingCurveRate))
  }

  useLayoutEffect(() => {
    if (
      !visible ||
      isPreviewMode ||
      !fundingCycle ||
      !ticketMods ||
      !payoutMods
    )
      return

    const metadata = decodeFundingCycleMetadata(fundingCycle.metadata)
    if (!metadata) return

    dispatch(
      editingProjectActions.setFundingCycle(
        serializeFundingCycle({
          ...fundingCycle,
          ...metadata,
          reserved: BigNumber.from(metadata.reservedRate),
          bondingCurveRate: BigNumber.from(metadata.bondingCurveRate),
        }),
      ),
    )
    setEditingTicketMods(ticketMods)
    setEditingPayoutMods(payoutMods)
    ticketingForm.setFieldsValue({
      reserved: parseFloat(fromPerbicent(metadata.reservedRate)),
    })

    if (metadata.version === 1) {
      restrictedActionsForm.setFieldsValue({
        payIsPaused: metadata.payIsPaused,
        ticketPrintingIsAllowed: metadata.ticketPrintingIsAllowed,
      })
    }
  }, [
    dispatch,
    fundingCycle,
    payoutMods,
    ticketMods,
    ticketingForm,
    restrictedActionsForm,
    isPreviewMode,
    visible,
  ])

  async function reconfigure() {
    if (
      !transactor ||
      !contracts?.TerminalV1_1 ||
      !projectId ||
      !terminal?.version
    )
      return

    setLoading(true)

    const properties: Record<keyof FCProperties, string> = {
      target: editingFC.target.toHexString(),
      currency: editingFC.currency.toHexString(),
      duration: editingFC.duration.toHexString(),
      discountRate: editingFC.discountRate.toHexString(),
      cycleLimit: BigNumber.from(0).toHexString(),
      ballot: editingFC.ballot,
    }

    const metadata: Omit<FundingCycleMetadata, 'version'> = {
      reservedRate: editingFC.reserved.toNumber(),
      bondingCurveRate: editingFC.bondingCurveRate.toNumber(),
      reconfigurationBondingCurveRate: editingFC.bondingCurveRate.toNumber(),
      payIsPaused: editingFC.payIsPaused,
      ticketPrintingIsAllowed: editingFC.ticketPrintingIsAllowed,
      treasuryExtension: constants.AddressZero,
    }

    transactor(
      terminal.version === '1.1'
        ? contracts.TerminalV1_1
        : contracts.TerminalV1,
      'configure',
      [
        projectId.toHexString(),
        properties,
        metadata,
        editingPayoutMods.map(m => ({
          preferUnstaked: false,
          percent: BigNumber.from(m.percent).toHexString(),
          lockedUntil: BigNumber.from(m.lockedUntil ?? 0).toHexString(),
          beneficiary: m.beneficiary || constants.AddressZero,
          projectId: m.projectId || BigNumber.from(0).toHexString(),
          allocator: constants.AddressZero,
        })),
        editingTicketMods.map(m => ({
          preferUnstaked: false,
          percent: BigNumber.from(m.percent).toHexString(),
          lockedUntil: BigNumber.from(m.lockedUntil ?? 0).toHexString(),
          beneficiary: m.beneficiary || constants.AddressZero,
          allocator: constants.AddressZero,
        })),
      ],
      {
        onDone: () => {
          setLoading(false)
          if (onDone) onDone()
        },
      },
    )
  }

  const drawerStyle: Partial<DrawerProps> = {
    placement: 'right',
    width: Math.min(640, window.innerWidth * 0.9),
  }

  const buildSteps = useCallback(
    (steps: { title: string; callback: VoidFunction }[]) => (
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {steps.map((step, i) => {
          const active = currentStep === i

          return (
            <div
              key={step.title}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                cursor: 'pointer',
                padding: 10,
                borderRadius: radii.sm,
                border:
                  '1px solid ' +
                  (active
                    ? colors.stroke.action.primary
                    : colors.stroke.action.secondary),
              }}
              onClick={() => {
                setCurrentStep(i)
                step.callback()
              }}
            >
              <div
                style={{
                  fontWeight: active ? 600 : 500,
                  color: active
                    ? colors.text.action.primary
                    : colors.text.primary,
                }}
              >
                {step.title}
              </div>
              <div
                style={{
                  color: active
                    ? colors.icon.action.primary
                    : colors.icon.primary,
                }}
              >
                <CaretRightFilled />
              </div>
            </div>
          )
        })}
      </Space>
    ),
    [currentStep, colors, radii],
  )

  if (!terminal?.version) return null

  return (
    <Modal
      visible={visible}
      onOk={reconfigure}
      confirmLoading={loading}
      onCancel={onDone}
      okText={t`Save reconfiguration`}
      width={600}
    >
      <div>
        <h1 style={{ marginBottom: 20 }}>
          <Trans>Reconfigure funding</Trans>
        </h1>

        {currentFC?.duration.gt(0) && (
          <p>
            <Trans>
              All changes will be applied to the <b>upcoming</b> funding cycle.
            </Trans>
          </p>
        )}

        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            {buildSteps([
              {
                title: t`Funding`,
                callback: () => setBudgetFormModalVisible(true),
              },
              ...(editingFC.target.gt(0)
                ? [
                    {
                      title: t`Spending`,
                      callback: () => setPayModsFormModalVisible(true),
                    },
                  ]
                : []),
              {
                title: t`Reserved tokens`,
                callback: () => setTicketingFormModalVisible(true),
              },
              {
                title: t`Rules`,
                callback: () => setRulesFormModalVisible(true),
              },
              ...(terminal.version === '1.1'
                ? [
                    {
                      title: 'Actions',
                      callback: () =>
                        setRestrictedActionsFormModalVisible(true),
                    },
                  ]
                : []),
              ...(isRecurring(editingFC) && hasFundingTarget(editingFC)
                ? [
                    {
                      title: t`Incentives`,
                      callback: () => setIncentivesFormModalVisible(true),
                    },
                  ]
                : []),
            ])}
          </div>

          {hasFundingTarget(editingFC) && (
            <Space size="large">
              <Statistic
                title={t`Duration`}
                value={
                  editingFC.duration.gt(0)
                    ? formattedNum(editingFC.duration)
                    : 'Not set'
                }
                suffix={editingFC.duration.gt(0) ? 'days' : ''}
              />
              <Statistic
                title={t`Amount`}
                valueRender={() => (
                  <span>
                    <CurrencySymbol
                      currency={editingFC.currency.toNumber() as CurrencyOption}
                    />
                    {formatWad(editingFC.target)}{' '}
                    <span style={{ fontSize: '0.8rem' }}>
                      (
                      {terminalFee?.gt(0) ? (
                        <span>
                          <CurrencySymbol
                            currency={
                              editingFC.currency.toNumber() as CurrencyOption
                            }
                          />
                          <Trans>
                            {formatWad(
                              amountSubFee(editingFC.target, terminalFee),
                              { precision: 4 },
                            )}{' '}
                            after JBX fee
                          </Trans>
                        </span>
                      ) : (
                        <span>
                          <Trans>0% fee</Trans>
                        </span>
                      )}
                      )
                    </span>
                  </span>
                )}
              />
            </Space>
          )}

          <Space size="large" align="end">
            <Statistic
              title={t`Reserved tokens`}
              value={fromPerbicent(editingFC.reserved)}
              suffix="%"
            />
            {editingFC &&
              isRecurring(editingFC) &&
              hasFundingTarget(editingFC) && (
                <Statistic
                  title={t`Discount rate`}
                  value={fromPermille(editingFC.discountRate)}
                  suffix="%"
                />
              )}
            {editingFC &&
              isRecurring(editingFC) &&
              hasFundingTarget(editingFC) && (
                <Statistic
                  title={t`Bonding curve rate`}
                  value={fromPerbicent(editingFC.bondingCurveRate)}
                  suffix="%"
                />
              )}
          </Space>

          <Statistic
            title={t`Reconfiguration strategy`}
            valueRender={() => {
              const ballot = getBallotStrategyByAddress(editingFC.ballot)
              return (
                <div>
                  {ballot.name}{' '}
                  <div style={{ fontSize: '0.7rem' }}>{ballot.address}</div>
                </div>
              )
            }}
          />

          {terminal.version === '1.1' && (
            <Space size="large">
              <Statistic
                title={t`Payments paused`}
                value={editingFC.payIsPaused ? 'Yes' : 'No'}
              />
              <Statistic
                title={t`Token minting`}
                value={
                  editingFC.ticketPrintingIsAllowed ? 'Allowed' : 'Disabled'
                }
              />
            </Space>
          )}

          <div>
            <h4>
              <Trans>Spending</Trans>
            </h4>
            <PayoutModsList
              mods={editingPayoutMods}
              projectId={undefined}
              fundingCycle={editingFC}
              fee={terminalFee}
            />
          </div>

          <div>
            <h4>
              <Trans>Reserved token allocations</Trans>
            </h4>
            <TicketModsList
              mods={editingTicketMods}
              projectId={undefined}
              fundingCycle={undefined}
            />
          </div>
        </Space>
      </div>

      <Drawer
        visible={budgetFormModalVisible}
        {...drawerStyle}
        onClose={() => {
          setBudgetFormModalVisible(false)
          setCurrentStep(undefined)
        }}
        destroyOnClose
      >
        <BudgetForm
          initialCurrency={editingFC.currency.toNumber() as CurrencyOption}
          initialTarget={fromWad(editingFC.target)}
          initialDuration={editingFC.duration.toString()}
          onSave={async (currency, target, duration) => {
            onBudgetFormSaved(currency, target, duration)
            setBudgetFormModalVisible(false)
            setCurrentStep(undefined)
          }}
        />
      </Drawer>

      <Drawer
        visible={payModsModalVisible}
        {...drawerStyle}
        onClose={() => {
          setPayModsFormModalVisible(false)
          setCurrentStep(undefined)
        }}
        destroyOnClose
      >
        <PayModsForm
          initialMods={editingPayoutMods}
          currency={editingFC.currency.toNumber() as CurrencyOption}
          target={editingFC.target}
          fee={terminalFee}
          onSave={async mods => {
            onPayModsFormSaved(mods)
            setPayModsFormModalVisible(false)
            setCurrentStep(undefined)
          }}
        />
      </Drawer>

      <Drawer
        visible={ticketingFormModalVisible}
        {...drawerStyle}
        onClose={() => {
          resetTicketingForm()
          setTicketingFormModalVisible(false)
          setCurrentStep(undefined)
        }}
      >
        <TicketingForm
          form={ticketingForm}
          initialMods={editingTicketMods}
          onSave={async mods => {
            await ticketingForm.validateFields()
            onTicketingFormSaved(mods)
            setTicketingFormModalVisible(false)
            setCurrentStep(undefined)
          }}
        />
      </Drawer>

      <Drawer
        visible={rulesFormModalVisible}
        {...drawerStyle}
        onClose={() => setRulesFormModalVisible(false)}
      >
        <RulesForm
          initialBallot={editingFC.ballot}
          onSave={(ballot: string) => {
            onRulesFormSaved(ballot)
            setRulesFormModalVisible(false)
          }}
        />
      </Drawer>

      <Drawer
        visible={incentivesFormModalVisible}
        {...drawerStyle}
        onClose={() => {
          setIncentivesFormModalVisible(false)
          setCurrentStep(undefined)
        }}
      >
        <IncentivesForm
          initialDiscountRate={fromPermille(editingFC.discountRate)}
          initialBondingCurveRate={fromPerbicent(editingFC.bondingCurveRate)}
          disableBondingCurve={
            !hasFundingTarget(editingFC)
              ? t`Bonding curve disabled while no funding target is set.`
              : undefined
          }
          onSave={async (discountRate: string, bondingCurveRate: string) => {
            await ticketingForm.validateFields()
            onIncentivesFormSaved(discountRate, bondingCurveRate)
            setIncentivesFormModalVisible(false)
            setCurrentStep(undefined)
          }}
        />
      </Drawer>

      {terminal.version === '1.1' && (
        <Drawer
          visible={restrictedActionsFormModalVisible}
          {...drawerStyle}
          onClose={() => {
            resetRestrictedActionsForm()
            setRestrictedActionsFormModalVisible(false)
            setCurrentStep(undefined)
          }}
        >
          <RestrictedActionsForm
            form={restrictedActionsForm}
            onSave={() => {
              onRestrictedActionsFormSaved()
              setRestrictedActionsFormModalVisible(false)
              setCurrentStep(undefined)
            }}
          />
        </Drawer>
      )}
    </Modal>
  )
}
