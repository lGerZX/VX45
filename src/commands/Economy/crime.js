import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const CRIME_COOLDOWN = 60 * 60 * 1000; // 1 hora
const JAIL_TIME = 2 * 60 * 60 * 1000; // 2 horas
const FINE_RATE = 0.2;

const CRIME_TYPES = {
    'pickpocketing': {
        name: "Carterismo",
        min: 100,
        max: 500,
        risk: 0.3,
        successMsgs: [
            "Le sacaste la billetera a un turista distraído en la estación de metro.",
            "Desorganizaste a la multitud y te llevaste un reloj de lujo sin que lo notaran.",
            "Aprovechaste el tumulto en el concierto para limpiar varios bolsillos."
        ],
        failMsgs: [
            "El sujeto sintió tu mano en su bolsillo y te inmovilizó en el acto.",
            "Intentaste robarle la billetera a un policía encubierto.",
            "La víctima te atrapó con las manos en la masa y gritó pidiendo ayuda."
        ]
    },
    'burglary': {
        name: "Robo a casa",
        min: 300,
        max: 1000,
        risk: 0.4,
        successMsgs: [
            "Entraste por la ventana trasera de una mansión y te llevaste la joyería fina.",
            "Desactivaste la alarma a tiempo y vaciaste la caja fuerte del estudio.",
            "Aprovechaste que los dueños estaban de viaje y saliste con varios objetos de valor."
        ],
        failMsgs: [
            "El perro guardián empezó a ladrar e hizo despertar a todo el vecindario.",
            "Activaste un sensor de movimiento de última generación y llegó la patrulla.",
            "Los propietarios regresaron antes de lo planeado y te acorralaron."
        ]
    },
    'bank-heist': {
        name: "Asalto al banco",
        min: 1000,
        max: 5000,
        risk: 0.6,
        successMsgs: [
            "Tu plan en la bóveda principal salió a la perfección y escapaste en la oscuridad.",
            "Fuga de película a toda velocidad esquivando a las patrullas en la autopista.",
            "Hackeaste las cámaras y neutralizaste a los guardias sin llamar la atención."
        ],
        failMsgs: [
            "Un cajero presionó el botón de pánico silencioso bajo el mostrador.",
            "La bolsa de pintura de seguridad explotó tiñendo todo el botín y fuiste rodeado.",
            "La policía bloqueó todas las salidas de emergencia antes de que salieras."
        ]
    },
    'art-theft': {
        name: "Robo de arte",
        min: 2000,
        max: 10000,
        risk: 0.7,
        successMsgs: [
            "Cambiaste una pintura famosa por una réplica barata y nadie lo notó.",
            "Te deslizaste por el tragaluz al estilo Misión Imposible y te llevaste la escultura.",
            "Burlaste los sensores térmicos del museo y vendiste la obra en el mercado negro."
        ],
        failMsgs: [
            "Rozaste un láser invisible y las compuertas blindadas se cerraron de golpe.",
            "El comprador clandestino resultó ser un agente encubierto de la INTERPOL.",
            "El peso del pedestal cambió al retirar la pieza y se activó el cierre automático."
        ]
    },
    'cybercrime': {
        name: "Ciberdelito",
        min: 5000,
        max: 20000,
        risk: 0.8,
        successMsgs: [
            "Infiltraste un servidor corporativo y exigiste un rescate millonario en criptomonedas.",
            "Creaste una red de bots que extrajo fondos de cuentas bancarias offshore desprotegidas.",
            "Ejecutaste un ataque de ingeniería social perfecto a un fondo de inversión."
        ],
        failMsgs: [
            "Tu VPN falló a mitad de la transferencia y rastrearon tu dirección IP real.",
            "El cortafuegos con IA de la empresa detectó la intrusión y bloqueó tus accesos.",
            "Un equipo SWAT rodeó tu casa tras ser localizado por la división cibernética."
        ]
    }
};

export default {
    data: new SlashCommandBuilder()
        .setName('crime')
        .setDescription('Comete un crimen para ganar dinero (riesgoso)')
        .addStringOption(option =>
            option
                .setName('tipo')
                .setDescription('Tipo de crimen a cometer')
                .setRequired(true)
                .addChoices(
                    { name: 'Carterismo', value: 'pickpocketing' },
                    { name: 'Robo a casa', value: 'burglary' },
                    { name: 'Asalto al banco', value: 'bank-heist' },
                    { name: 'Robo de arte', value: 'art-theft' },
                    { name: 'Ciberdelito', value: 'cybercrime' }
                )
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);
        const lastCrime = userData.cooldowns?.crime || 0;
        const isJailed = userData.jailedUntil && userData.jailedUntil > now;

        if (isJailed) {
            const timeLeft = Math.ceil((userData.jailedUntil - now) / (1000 * 60));
            throw createError(
                "User is in jail",
                ErrorTypes.RATE_LIMIT,
                `Estas en la carcel Te quedan **${timeLeft} minuto(s)** de condena`,
                { jailTimeRemaining: userData.jailedUntil - now }
            );
        }

        if (now < lastCrime + CRIME_COOLDOWN) {
            const timeLeft = Math.ceil((lastCrime + CRIME_COOLDOWN - now) / (1000 * 60));
            throw createError(
                "Crime cooldown active",
                ErrorTypes.RATE_LIMIT,
                `Debes esperar **${timeLeft} minuto(s)** antes de cometer otro crimen`,
                { remaining: lastCrime + CRIME_COOLDOWN - now, cooldownType: 'crime' }
            );
        }

        const crimeTypeKey = interaction.options.getString("tipo").toLowerCase();
        const crime = CRIME_TYPES[crimeTypeKey];

        if (!crime) {
            throw createError(
                "Invalid crime type",
                ErrorTypes.VALIDATION,
                "Por favor selecciona un tipo de crimen valido",
                { crimeType: crimeTypeKey }
            );
        }

        const isSuccess = Math.random() > crime.risk;
        const amountEarned = isSuccess
            ? Math.floor(Math.random() * (crime.max - crime.min + 1)) + crime.min
            : 0;

        userData.cooldowns = userData.cooldowns || {};
        userData.cooldowns.crime = now;

        if (isSuccess) {
            userData.wallet = (userData.wallet || 0) + amountEarned;

            await setEconomyData(client, guildId, userId, userData);

            const randomSuccessMessage = crime.successMsgs[Math.floor(Math.random() * crime.successMsgs.length)];

            const embed = successEmbed(
                `🕵️ Crimen exitoso: ${crime.name}`,
                `${randomSuccessMessage}\n\n**Botin obtenido:** $${amountEarned.toLocaleString()}`
            ).addFields({
                name: "Saldo en billetera",
                value: `$${userData.wallet.toLocaleString()}`,
                inline: true
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        } else {
            const potentialHaul = Math.floor((crime.min + crime.max) / 2);
            const fine = Math.min(Math.floor(potentialHaul * FINE_RATE), userData.wallet || 0);

            userData.wallet = Math.max(0, (userData.wallet || 0) - fine);
            userData.jailedUntil = now + JAIL_TIME;

            await setEconomyData(client, guildId, userId, userData);

            const randomFailMessage = crime.failMsgs[Math.floor(Math.random() * crime.failMsgs.length)];

            const embed = warningEmbed(
                `🚔 Crimen fallido: ${crime.name}`,
                `${randomFailMessage}\n\n**Multa pagada:** $${fine.toLocaleString()}\n**Tiempo en prision:** 2 horas`
            ).addFields({
                name: "Saldo en billetera",
                value: `$${userData.wallet.toLocaleString()}`,
                inline: true
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }
    }, { command: 'crime' })
};
