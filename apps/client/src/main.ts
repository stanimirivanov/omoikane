import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app';

const renderBootstrapFailure = (error: unknown): void => {
  console.error(error);

  const applicationRoot = document.querySelector('app-root');

  if (applicationRoot === null) {
    return;
  }

  const failureScreen = document.createElement('main');
  failureScreen.className = 'application-startup application-startup--failed';
  failureScreen.setAttribute('aria-label', 'Omoikane startup failed');

  const content = document.createElement('div');
  content.className = 'application-startup__content';

  const mark = document.createElement('span');
  mark.className = 'application-startup__mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = 'O';

  const message = document.createElement('div');
  const product = document.createElement('p');
  product.className = 'application-startup__product';
  product.textContent = 'Omoikane';

  const status = document.createElement('p');
  status.className = 'application-startup__status';
  status.setAttribute('role', 'alert');
  status.textContent = 'The application could not start.';

  const guidance = document.createElement('p');
  guidance.className = 'application-startup__guidance';
  guidance.textContent = 'Reload the page to try again.';

  const reloadButton = document.createElement('button');
  reloadButton.className = 'application-startup__action';
  reloadButton.type = 'button';
  reloadButton.textContent = 'Reload application';
  reloadButton.addEventListener('click', () => window.location.reload());

  message.append(product, status, guidance);
  content.append(mark, message, reloadButton);
  failureScreen.append(content);
  applicationRoot.replaceChildren(failureScreen);
};

bootstrapApplication(AppComponent, appConfig).catch(renderBootstrapFailure);
