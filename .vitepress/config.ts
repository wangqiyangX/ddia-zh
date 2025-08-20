import { type DefaultTheme, defineConfig } from "vitepress";

export default defineConfig({
	title: "DDIA 第二版中文翻译",
	description: "",
	base: "/ddia-zh/",
	srcExclude: ["**/README.md", "**/TODO.md"],
	cleanUrls: true,
	themeConfig: {
		nav: [],
		sidebar: [
			{
				text: "前言",
				link: "/src/preface",
			},
			{
				text: "第一章 数据系统架构中的权衡",
				link: "/src/tradeoffs-in-data-systems-architecture",
			},
			{
				text: "第二章 定义非功能性需求",
				link: "/src/defining-nonfunctional-requirements",
			},
			{
				text: "第三章 数据模型与查询语言",
				link: "/src/data-models-and-query-languages",
			},
			{
				text: "第四章 存储与检索",
				link: "/src/storage-and-retrieval",
			},
			{
				text: "第五章 编码与演进",
				link: "/src/encoding-and-evolution",
			},
			{
				text: "第六章 复制",
				link: "/src/replication",
			},
			{
				text: "第七章 分片",
				link: "/src/sharding",
			},
			{
				text: "第八章 事务",
				link: "/src/transactions",
			},
		],
		search: { options: searchOptions() },
		editLink: {
			pattern: "https://github.com/wangqiyangx/ddia-zh/edit/main/:path",
			text: "在 GitHub 上编辑此页面",
		},
		footer: {
			message: "基于 MIT 许可发布",
			copyright: `版权所有 © 2025-${new Date().getFullYear()} @wangqiyangx`,
		},
		docFooter: {
			prev: "上一页",
			next: "下一页",
		},
		outline: {
			level: "deep",
			label: "页面导航",
		},
		lastUpdated: {
			text: "最后更新于",
			formatOptions: {
				forceLocale: true,
				dateStyle: "full",
				timeStyle: "medium",
			},
		},
		notFound: {
			title: "页面未找到",
			quote:
				"但如果您不改变方向，并且继续寻找，您可能最终会到达您所前往的地方。",
			linkLabel: "前往首页",
			linkText: "带我回首页",
		},
		langMenuLabel: "多语言",
		returnToTopLabel: "回到顶部",
		sidebarMenuLabel: "菜单",
		darkModeSwitchLabel: "主题",
		lightModeSwitchTitle: "切换到浅色模式",
		darkModeSwitchTitle: "切换到深色模式",
		skipToContentLabel: "跳转到内容",
		socialLinks: [
			{
				icon: "github",
				link: "https://github.com/wangqiyangx/ddia-zh",
				ariaLabel: "GitHub",
			},
			{ icon: "x", link: "https://x.com/wangqiyangx", ariaLabel: "X" },
		],
	},
});

function searchOptions(): Partial<DefaultTheme.LocalSearchOptions> {
	return {
		translations: {
			button: {
				buttonText: "搜索",
				buttonAriaLabel: "搜索",
			},
			modal: {
				displayDetails: "显示细节",
				resetButtonTitle: "重置搜索",
				backButtonTitle: "返回",
				noResultsText: "无搜索结果",
				footer: {
					selectText: "跳转",
					selectKeyAriaLabel: "跳转",
					navigateText: "选择",
					navigateUpKeyAriaLabel: "选择上一项",
					navigateDownKeyAriaLabel: "选择下一项",
					closeText: "关闭",
					closeKeyAriaLabel: "关闭",
				},
			},
		},
	};
}
