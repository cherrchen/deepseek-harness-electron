// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import {
  CommitMessageSettingsCardController,
  commitMessageModelKey,
  type CommitMessageSettingsCardState,
} from '../src/client/settings/commit-message-card-controller.ts'
import { CommitMessageSettingsCard } from '../src/client/settings/CommitMessageSettingsCard.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
})

function controllerOf(state: CommitMessageSettingsCardState): CommitMessageSettingsCardController {
  return {
    getSnapshot: () => state,
    subscribe: () => () => {},
    setMode: vi.fn(),
    setModel: vi.fn(),
    setProviderText: vi.fn(),
    setModelText: vi.fn(),
    setSystemPrompt: vi.fn(),
    retryCatalog: vi.fn(),
    save: vi.fn(),
    discard: vi.fn(),
    dispose: vi.fn(),
  } as unknown as CommitMessageSettingsCardController
}

const locale: PropsLocale<'git'> = { t: (key) => en[key] }

function ready(overrides: Partial<CommitMessageSettingsCardState> = {}): CommitMessageSettingsCardState {
  return {
    available: true,
    writable: true,
    dirty: false,
    invalid: false,
    saving: false,
    failed: false,
    mode: 'inherit',
    provider: '',
    model: '',
    systemPrompt: '',
    candidates: [],
    catalogStatus: 'idle',
    catalogPartial: false,
    ...overrides,
  }
}

describe('CommitMessageSettingsCard', () => {
  it('renders nothing while the namespace is unavailable', () => {
    const { container } = render(
      <CommitMessageSettingsCard
        controller={controllerOf(ready({ available: false }))}
        {...locale}
      />,
    )
    expect(container.querySelector('[data-git-commit-message-settings]')).toBeNull()
  })

  it('lets the user pick a custom model and edit the system message', () => {
    const controller = controllerOf(ready({
      mode: 'custom',
      dirty: true,
      catalogStatus: 'ready',
      candidates: [
        {
          key: commitMessageModelKey({ provider: 'deepseek', model: 'chat' }),
          provider: 'deepseek',
          model: 'chat',
          providerName: 'DeepSeek',
          modelName: 'DeepSeek Chat',
          available: true,
        },
      ],
    }))
    render(<CommitMessageSettingsCard controller={controller} {...locale} />)
    fireEvent.click(screen.getByRole('button', { name: `${en['settings.expand']}: ${en['settings.title']}` }))
    fireEvent.click(screen.getByRole('radio', { name: en['settings.modelInherit'] }))
    expect(controller.setMode).toHaveBeenCalledWith('inherit')
    fireEvent.change(screen.getByLabelText(en['settings.modelSelect']), {
      target: { value: commitMessageModelKey({ provider: 'deepseek', model: 'chat' }) },
    })
    expect(controller.setModel).toHaveBeenCalledWith(commitMessageModelKey({ provider: 'deepseek', model: 'chat' }))
    fireEvent.change(screen.getByLabelText(en['settings.systemPrompt']), { target: { value: 'Be terse.' } })
    expect(controller.setSystemPrompt).toHaveBeenCalledWith('Be terse.')
    fireEvent.click(screen.getByRole('button', { name: en['settings.save'] }))
    expect(controller.save).toHaveBeenCalled()
  })

  it('falls back to typed provider and model ids when the catalog is empty', () => {
    const controller = controllerOf(ready({
      mode: 'custom',
      dirty: true,
      invalid: true,
      catalogStatus: 'ready',
    }))
    render(<CommitMessageSettingsCard controller={controller} {...locale} />)
    fireEvent.click(screen.getByRole('button', { name: `${en['settings.expand']}: ${en['settings.title']}` }))
    expect(screen.getByText(en['settings.catalogEmpty'])).toBeTruthy()
    fireEvent.change(screen.getByLabelText(en['settings.provider']), { target: { value: 'custom-provider' } })
    fireEvent.change(screen.getByLabelText(en['settings.modelId']), { target: { value: 'custom-model' } })
    expect(controller.setProviderText).toHaveBeenCalledWith('custom-provider')
    expect(controller.setModelText).toHaveBeenCalledWith('custom-model')
    expect((screen.getByRole('button', { name: en['settings.save'] }) as HTMLButtonElement).disabled).toBe(true)
  })
})
