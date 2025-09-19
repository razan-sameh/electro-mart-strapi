export const routes = [
    {
        method: "GET",
        path: "/best-sellers",
        handler: "best-sellers.find",
        config: {
            auth: false, // allow public access (disable if you want auth)
        },
    },
];
