import type { Locator, Page } from '@playwright/test';
import {
  documentResult,
  performDocumentedAction,
  type GuideNarrator,
} from '../user-guide/guide-narrator';

export class WorkspaceManagementPage {
  constructor(
    private readonly page: Page,
    private readonly narrator?: GuideNarrator
  ) {}

  panel(): Locator {
    return this.page.locator('#workspace-context-panel');
  }

  async open(): Promise<this> {
    const button = this.page.getByRole('button', {
      name: 'Open workspace management',
    });
    await performDocumentedAction(
      this.narrator,
      button,
      {
        body: 'Open workspace administration, member access, invitations, and archived workspaces.',
        title: 'Open workspace management',
      },
      () => button.click()
    );
    return this;
  }

  async create(name: string, slug: string, description: string): Promise<this> {
    const create = this.panel().getByRole('button', {
      exact: true,
      name: 'Create',
    });
    await performDocumentedAction(
      this.narrator,
      create,
      {
        body: 'Start a separate collaboration space with its own membership and channels.',
        title: 'Create a workspace',
      },
      () => create.click()
    );
    await this.panel().getByLabel('Workspace name').fill(name);
    await this.panel().getByLabel('Workspace URL').fill(slug);
    await this.panel().getByLabel('Description').fill(description);
    const submit = this.panel().getByRole('button', {
      exact: true,
      name: 'Create workspace',
    });
    await performDocumentedAction(
      this.narrator,
      submit,
      {
        body: 'Save the workspace after choosing its name, URL slug, and description.',
        title: 'Save the workspace',
      },
      async () => {
        await submit.press('Enter');
        await this.page
          .getByRole('heading', { exact: true, name })
          .waitFor({ state: 'visible' });
      }
    );
    return this;
  }

  async editName(name: string): Promise<this> {
    const edit = this.panel().getByRole('button', { name: 'Edit workspace' });
    await performDocumentedAction(
      this.narrator,
      edit,
      {
        body: 'Open the selected workspace settings when its identity needs to change.',
        title: 'Edit workspace settings',
      },
      () => edit.press('Enter')
    );
    const input = this.panel().getByLabel('Workspace name');
    await performDocumentedAction(
      this.narrator,
      input,
      {
        body: 'Update the human-readable workspace name.',
        title: 'Rename the workspace',
      },
      async () => {
        await input.fill(name);
        await input.press('Enter');
        await this.page
          .getByRole('heading', { exact: true, name })
          .waitFor({ state: 'visible' });
      }
    );
    return this;
  }

  async archive(name: string): Promise<this> {
    await this.panel()
      .getByRole('button', { name: 'Archive workspace' })
      .press('Enter');
    const confirm = this.panel().getByRole('button', {
      name: 'Confirm archive',
    });
    await performDocumentedAction(
      this.narrator,
      confirm,
      {
        body: `Archive ${name} without deleting its collaboration history.`,
        title: 'Confirm workspace archival',
      },
      async () => {
        await confirm.click();
        await this.page
          .getByRole('heading', { name: 'Your workspaces' })
          .waitFor({ state: 'visible' });
      }
    );

    return this;
  }

  async documentArchived(): Promise<void> {
    await documentResult(
      this.narrator,
      this.page.getByRole('heading', { name: 'Your workspaces' }),
      {
        body: 'The archived workspace has left active navigation while its history remains preserved.',
        title: 'Confirm workspace archival',
      }
    );
  }

  async inviteAndCancel(username: string): Promise<void> {
    const input = this.panel().getByLabel('Exact username');
    await performDocumentedAction(
      this.narrator,
      input,
      {
        body: 'Enter the exact username of the collaborator you want to invite.',
        title: 'Choose a collaborator',
      },
      () => input.fill(username)
    );
    await this.panel().getByRole('button', { name: 'Send invitation' }).click();
    const card = this.panel()
      .getByRole('list', { name: 'Pending invitations for selected workspace' })
      .getByRole('listitem')
      .filter({ hasText: username });
    await documentResult(this.narrator, card, {
      body: 'The invitation remains pending until the recipient accepts it.',
      title: 'Review the pending invitation',
    });
    await card
      .getByRole('button', { name: `Cancel invitation for ${username}` })
      .click();
    const confirm = card.getByRole('button', {
      name: `Confirm cancellation for ${username}`,
    });
    await performDocumentedAction(
      this.narrator,
      confirm,
      {
        body: 'Cancel a pending invitation before it grants access.',
        title: 'Cancel the invitation',
      },
      () => confirm.click()
    );
  }

  member(displayName: string): Locator {
    return this.panel()
      .getByRole('list', { name: 'Active workspace members' })
      .getByRole('listitem')
      .filter({ hasText: displayName });
  }

  async promoteAndRestoreMember(displayName: string): Promise<void> {
    const member = this.member(displayName);
    const promote = member.getByRole('button', {
      name: `Make owner: ${displayName}`,
    });
    await performDocumentedAction(
      this.narrator,
      promote,
      {
        body: 'Promote a member when they need workspace administration privileges.',
        title: 'Make the member an owner',
      },
      () => promote.click()
    );
    const demote = member.getByRole('button', {
      name: `Make member: ${displayName}`,
    });
    await documentResult(this.narrator, demote, {
      body: 'The collaborator now has the Owner role. Roles can be changed again when responsibilities change.',
      title: 'Confirm the role change',
    });
    await demote.click();
  }
}
