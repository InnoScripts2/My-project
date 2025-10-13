import { createApp } from 'vue';
import { createPinia } from 'pinia';
import Antd from 'ant-design-vue';
import App from './App.vue';
import router from './router';
import 'ant-design-vue/dist/reset.css';
import { loadRuntimeConfig, getRuntimeConfig } from '@/services/runtimeConfig';
import axios from 'axios';
import { i18n } from '@/i18n';

async function bootstrap() {
	await loadRuntimeConfig();
		const cfg = getRuntimeConfig();
		if (cfg?.API_BASE_URL) {
			axios.defaults.baseURL = cfg.API_BASE_URL;
		}
	const app = createApp(App);
	const pinia = createPinia();

	app.use(pinia);
	app.use(router);
	app.use(Antd);
		app.use(i18n);

	app.mount('#app');
}

bootstrap();
