import './styles/main.css';
import { Engine } from './core/Engine';
import { Renderer } from './core/Renderer';
import { showErrorScreen } from './interface/Screens';

/**
 * Ponto de entrada do EDENWORLD: verifica o suporte do navegador,
 * inicia o jogo e mostra uma tela amigável se algo impedir a execução.
 */
async function boot(): Promise<void> {
  const canvas = document.getElementById('game-canvas');
  const uiRoot = document.getElementById('ui-root');
  if (!(canvas instanceof HTMLCanvasElement) || !uiRoot) {
    throw new Error('Estrutura da página incompleta: #game-canvas ou #ui-root ausente.');
  }

  if (!Renderer.isWebGL2Available()) {
    showErrorScreen(
      uiRoot,
      'Seu navegador não oferece WebGL2',
      [
        'O EDENWORLD precisa de WebGL2 para desenhar Aurora City em 3D.',
        'Atualize o navegador (Chrome, Edge, Firefox ou Safari recentes), verifique se a aceleração de hardware está ativada e tente novamente.',
      ],
      true,
    );
    return;
  }

  try {
    await Engine.start(canvas, uiRoot);
  } catch (error) {
    console.error('[EDENWORLD] Falha ao iniciar:', error);
    uiRoot.querySelector('.loading')?.remove();
    showErrorScreen(uiRoot, 'Não foi possível iniciar o jogo', [
      'Ocorreu um erro ao preparar Aurora City.',
      'Recarregue a página. Se o problema continuar, tente outro navegador ou feche outras abas para liberar memória.',
    ]);
  }
}

void boot();
