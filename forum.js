import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js';
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, doc, updateDoc, arrayUnion, getDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js';

const auth = getAuth();
const db = getFirestore();
let currentUser = null;

// Variables globales para el historial
let userHistory = {
    posts: [],
    replies: []
};
let currentHistoryFilter = 'all';
let searchQuery = '';

// Actualizar el estado de paginación para ser fijo
const POSTS_PER_PAGE = 10;
let paginationState = {
    currentPage: 1,
    totalPosts: 0,
    totalPages: 0
};

// Check authentication status
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }
    currentUser = user;
    loadPosts();
});

// Eliminar el event listener de búsqueda y simplificar la función loadPosts
function loadPosts() {
    const postsContainer = document.querySelector('.posts-container');
    const postsQuery = query(collection(db, 'forum_posts'), orderBy('createdAt', 'desc'));

    onSnapshot(postsQuery, (snapshot) => {
        const allPosts = [];
        snapshot.forEach((doc) => {
            allPosts.push({ id: doc.id, ...doc.data() });
        });

        // Aplicar filtros
        let filteredPosts = [...allPosts];

        // Filtrar por categoría si hay una seleccionada
        const selectedCategory = document.getElementById('categoryFilter').value;
        if (selectedCategory) {
            filteredPosts = filteredPosts.filter(post => post.category === selectedCategory);
        }

        // Ordenar posts
        const sortOrder = document.getElementById('sortPosts').value;
        filteredPosts.sort((a, b) => {
            if (sortOrder === 'newest') {
                return new Date(b.createdAt) - new Date(a.createdAt);
            } else {
                return new Date(a.createdAt) - new Date(b.createdAt);
            }
        });

        // Actualizar paginación
        paginationState.totalPosts = filteredPosts.length;
        paginationState.totalPages = Math.ceil(filteredPosts.length / POSTS_PER_PAGE);

        // Calcular índices para la página actual
        const startIndex = (paginationState.currentPage - 1) * POSTS_PER_PAGE;
        const endIndex = Math.min(startIndex + POSTS_PER_PAGE, filteredPosts.length);
        const currentPosts = filteredPosts.slice(startIndex, endIndex);

        // Renderizar posts
        postsContainer.innerHTML = currentPosts.map(post => createPostHTML(post)).join('');
        
        // Actualizar UI
        updatePagination();
        updatePostsCounter(startIndex + 1, endIndex, filteredPosts.length);

        // Actualizar historial
        updateUserHistory(allPosts);
    });
}

// Add pagination functions
function updatePagination() {
    const pagination = document.querySelector('.pagination');
    const { currentPage, totalPages } = paginationState;
    
    let paginationHTML = `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage - 1})">
                <i class="fas fa-chevron-left"></i>
            </a>
        </li>
    `;

    // Calculate visible page numbers
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    
    if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
    }

    // Add first page if necessary
    if (startPage > 1) {
        paginationHTML += `
            <li class="page-item">
                <a class="page-link" href="#" onclick="changePage(1)">1</a>
            </li>
            ${startPage > 2 ? '<li class="page-item disabled"><span class="page-link">...</span></li>' : ''}
        `;
    }

    // Add page numbers
    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
            <li class="page-item ${currentPage === i ? 'active' : ''}">
                <a class="page-link" href="#" onclick="changePage(${i})">${i}</a>
            </li>
        `;
    }

    // Add last page if necessary
    if (endPage < totalPages) {
        paginationHTML += `
            ${endPage < totalPages - 1 ? '<li class="page-item disabled"><span class="page-link">...</span></li>' : ''}
            <li class="page-item">
                <a class="page-link" href="#" onclick="changePage(${totalPages})">${totalPages}</a>
            </li>
        `;
    }

    paginationHTML += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage + 1})">
                <i class="fas fa-chevron-right"></i>
            </a>
        </li>
    `;

    pagination.innerHTML = paginationHTML;
}

// Simplificar la función de actualización del contador
function updatePostsCounter(start, end, total) {
    document.getElementById('totalPosts').textContent = 
        `Mostrando ${start}-${end} de ${total} publicaciones`;
}

// Eliminar los event listeners relacionados con el selector de posts por página
// y mantener solo la funcionalidad esencial de cambio de página
window.changePage = function(page) {
    if (page < 1 || page > paginationState.totalPages) return;
    
    paginationState.currentPage = page;
    loadPosts();
    
    // Scroll al inicio de los posts
    document.querySelector('.posts-container').scrollTo({
        top: 0,
        behavior: 'smooth'
    });
};

// Add search functionality
// Utility debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Actualizar la función que formatea las categorías
function getCategoryInfo(category) {
    const categories = {
        'streaming': 'Cuentas de Streaming',
        'ofertas': 'Cuentas Baratas/Promocionales',
        'premium': 'Cuentas Premium',
        'proveedor-streaming': 'Proveedor de Cuentas Streaming',
        'mayorista': 'Venta al por Mayor',
        'empresas': 'Cuentas para Empresas',
        'busco-streaming': 'Busco Cuentas Streaming',
        'busco-ofertas': 'Busco Ofertas'
    };
    
    return categories[category] || category;
}

// Create HTML for a post
function createPostHTML(post) {
    const replies = post.replies || [];
    const categoryClass = `category-badge ${post.category}`;
    const contactButtons = createContactButtons(post);
    const categoryName = getCategoryInfo(post.category);
    
    return `
        <div class="post-card card mb-4" data-category="${post.category}" data-post-id="${post.id}">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start mb-3">
                    <div>
                        <h5 class="card-title mb-1">${post.title}</h5>
                        <div class="d-flex align-items-center gap-2">
                            <span class="${categoryClass}">${categoryName}</span>
                            <small class="text-muted">
                                <i class="fas fa-user me-1"></i>${post.authorName || 'Usuario'}
                            </small>
                            <small class="text-muted">
                                <i class="fas fa-clock me-1"></i>${formatDate(post.createdAt)}
                            </small>
                        </div>
                    </div>
                </div>
                
                <p class="card-text">${formatPostContent(post.content)}</p>
                
                ${post.allowContact && contactButtons ? `
                    <div class="contact-buttons mt-3">
                        <p class="small text-muted mb-2">
                            <i class="fas fa-address-card me-1"></i>Opciones de contacto:
                        </p>
                        ${contactButtons}
                    </div>
                ` : ''}
                
                <hr>
                
                <div class="d-flex gap-2 align-items-center">
                    <button class="btn btn-sm btn-outline-primary" onclick="openReplyModal('${post.id}')">
                        <i class="fas fa-reply me-2"></i>Responder
                    </button>
                    ${post.authorId === currentUser.uid ? `
                        <button class="btn btn-sm btn-outline-danger" onclick="deletePost('${post.id}')">
                            <i class="fas fa-trash me-2"></i>Eliminar
                        </button>
                    ` : ''}
                    ${replies.length > 0 ? `
                        <button class="btn btn-sm btn-outline-secondary ms-auto replies-toggle" 
                                onclick="toggleReplies('${post.id}')">
                            <i class="fas fa-comments me-1"></i>
                            ${replies.length} ${replies.length === 1 ? 'comentario' : 'comentarios'}
                        </button>
                    ` : ''}
                </div>
                
                <div class="reply-section mt-3" style="display: none;" id="replies-${post.id}">
                    ${replies.map(reply => createReplyHTML(reply)).join('')}
                </div>
            </div>
        </div>
    `;
}

// Handle new post submission
document.getElementById('newPostForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleNewPost(e, false);
});

// Handle replies
document.getElementById('replyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const postId = document.getElementById('replyPostId').value;
    const content = document.getElementById('replyContent').value;
    
    try {
        const postRef = doc(db, 'forum_posts', postId);
        const reply = {
            content,
            authorId: currentUser.uid,
            authorName: currentUser.email.split('@')[0],
            createdAt: new Date().toISOString()
        };
        
        await updateDoc(postRef, {
            replies: arrayUnion(reply)
        });
        
        bootstrap.Modal.getInstance(document.getElementById('replyModal')).hide();
        e.target.reset();
        
        // Mostrar los comentarios después de agregar uno nuevo
        setTimeout(() => {
            const repliesSection = document.getElementById(`replies-${postId}`);
            if (repliesSection) {
                repliesSection.style.display = 'block';
                document.querySelector(`[data-post-id="${postId}"] .replies-toggle`).classList.add('active');
            }
        }, 100);
        
        showSuccess('Respuesta enviada exitosamente');
    } catch (error) {
        showError('Error al enviar la respuesta: ' + error.message);
    }
});

// Utility Functions
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('es-CL', { 
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showSuccess(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification bg-success';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showError(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification bg-danger';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000); // Corregido: agregado el punto
}

// Make necessary functions available globally
window.openReplyModal = function(postId) {
    document.getElementById('replyPostId').value = postId;
    new bootstrap.Modal(document.getElementById('replyModal')).show();
};

// Agregar función para formatear el contenido del post
function formatPostContent(content) {
    return content
        .replace(/\n/g, '<br>')
        .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
}

// Agregar función para crear botones de contacto
function createContactButtons(post) {
    if (!post.contact || !post.allowContact) return '';
    
    const buttons = [];
    
    if (post.contact.whatsapp) {
        const message = encodeURIComponent(`Hola, te contacto desde el foro de SellStream por tu publicación "${post.title}"`);
        buttons.push(`
            <a href="https://wa.me/56${post.contact.whatsapp}?text=${message}" 
               class="btn btn-sm btn-outline-success" target="_blank">
                <i class="fab fa-whatsapp me-1"></i>WhatsApp
            </a>
        `);
    }
    
    if (post.contact.telegram) {
        buttons.push(`
            <a href="https://t.me/${post.contact.telegram}" 
               class="btn btn-sm btn-outline-info" target="_blank">
                <i class="fab fa-telegram me-1"></i>Telegram
            </a>
        `);
    }
    
    if (post.contact.instagram) {
        buttons.push(`
            <a href="https://instagram.com/${post.contact.instagram}" 
               class="btn btn-sm btn-outline-danger" target="_blank">
                <i class="fab fa-instagram me-1"></i>Instagram
            </a>
        `);
    }
    
    if (post.contact.facebook) {
        buttons.push(`
            <a href="https://facebook.com/${post.contact.facebook}" 
               class="btn btn-sm btn-outline-primary" target="_blank">
                <i class="fab fa-facebook me-1"></i>Facebook
            </a>
        `);
    }
    
    return buttons.length ? `<div class="d-flex gap-2">${buttons.join('')}</div>` : '';
}

// Agregar función para crear HTML de respuestas
function createReplyHTML(reply) {
    return `
        <div class="reply-item">
            <div class="d-flex justify-content-between align-items-start">
                <div>
                    <p class="mb-1">${formatPostContent(reply.content)}</p>
                    <small class="text-muted">
                        <i class="fas fa-user me-1"></i>${reply.authorName || 'Usuario'} - 
                        <i class="fas fa-clock me-1"></i>${formatDate(reply.createdAt)}
                    </small>
                </div>
                ${reply.authorId === currentUser.uid ? `
                    <button class="btn btn-sm btn-link text-danger" 
                            onclick="deleteReply('${reply.id}')">
                        <i class="fas fa-times"></i>
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

// Agregar función para eliminar posts
window.deletePost = async (postId) => {
    if (!confirm('¿Estás seguro de eliminar esta publicación?')) return;
    
    try {
        await deleteDoc(doc(db, 'forum_posts', postId));
        showSuccess('Publicación eliminada exitosamente');
    } catch (error) {
        showError('Error al eliminar la publicación');
    }
};

// Eliminar la función loadUserHistory ya que ahora se maneja en tiempo real
// y modificar renderHistory para usar los datos actualizados
// Modificar la función renderHistory para incluir las nuevas funcionalidades
function renderHistory() {
    const historyContainer = document.getElementById('historyContainer');
    let postsToShow = [];

    // Aplicar filtros
    switch (currentHistoryFilter) {
        case 'own':
            postsToShow = userHistory.posts;
            break;
        case 'replied':
            postsToShow = userHistory.replies;
            break;
        default:
            postsToShow = [...userHistory.posts, ...userHistory.replies]
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // Eliminar duplicados (en caso de que un post sea propio y comentado)
    postsToShow = Array.from(new Map(postsToShow.map(item => [item.id, item])).values());

    // Aplicar búsqueda
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        postsToShow = postsToShow.filter(post => 
            post.title.toLowerCase().includes(query) ||
            post.content.toLowerCase().includes(query)
        );
    }

    // Mostrar resultados
    if (postsToShow.length === 0) {
        historyContainer.innerHTML = `
            <div class="text-center text-muted p-4">
                <i class="fas fa-search fa-3x mb-3"></i>
                <p>No se encontraron publicaciones</p>
            </div>
        `;
        return;
    }

    historyContainer.innerHTML = postsToShow.map(post => `
        <div class="card mb-3 post-card cursor-pointer" 
             data-category="${post.category}" 
             onclick="scrollToPost('${post.id}', true)">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="w-100">
                        <div class="d-flex justify-content-between align-items-start">
                            <h6 class="card-title mb-1">${post.title}</h6>
                            <div class="d-flex gap-2">
                                ${post.type === 'own' ? `
                                    <button class="btn btn-sm btn-danger" 
                                            onclick="event.stopPropagation(); deleteHistoryPost('${post.id}')">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <span class="category-badge ${post.category}">
                                ${getCategoryInfo(post.category)}
                            </span>
                            <small class="text-muted">
                                ${formatDate(post.createdAt)}
                            </small>
                            <span class="badge bg-${post.type === 'own' ? 'primary' : 'info'}">
                                ${post.type === 'own' ? 'Mi publicación' : 'Comentada'}
                            </span>
                        </div>
                        <p class="card-text small mt-2 text-muted">
                            ${post.content.length > 100 ? post.content.substring(0, 100) + '...' : post.content}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// Modificar la función scrollToPost para mejorar la experiencia
window.scrollToPost = (postId, fromHistory = false) => {
    // Cambiar a la pestaña de todas las publicaciones si venimos del historial
    if (fromHistory) {
        document.getElementById('allPosts-tab').click();
    }
    
    // Buscar y resaltar la publicación después de un breve delay para permitir el cambio de pestaña
    setTimeout(() => {
        const post = document.querySelector(`[data-post-id="${postId}"]`);
        if (post) {
            // Suavizar el scroll y centrar la publicación
            post.scrollIntoView({ 
                behavior: 'smooth',
                block: 'center'
            });
            
            // Añadir efecto de highlight
            post.classList.add('highlight-post');
            setTimeout(() => post.classList.remove('highlight-post'), 2000);
        }
    }, fromHistory ? 300 : 0);
};

// Agregar función para eliminar posts desde el historial
window.deleteHistoryPost = async (postId) => {
    if (!confirm('¿Estás seguro de eliminar esta publicación?')) return;
    
    try {
        await deleteDoc(doc(db, 'forum_posts', postId));
        showSuccess('Publicación eliminada exitosamente');
        
        // Actualizar el historial inmediatamente
        userHistory.posts = userHistory.posts.filter(post => post.id !== postId);
        renderHistory();
    } catch (error) {
        showError('Error al eliminar la publicación');
    }
};

// Modificar la función que maneja el cambio de pestañas
document.addEventListener('DOMContentLoaded', () => {
    const myHistoryTab = document.getElementById('myHistory-tab');
    if (myHistoryTab) {
        myHistoryTab.addEventListener('shown.bs.tab', () => {
            renderHistory(); // Ya no necesitamos loadUserHistory aquí
        });
    }
});

// Event listeners para el historial
document.getElementById('myHistory-tab').addEventListener('click', renderHistory);

document.getElementById('historySearch').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderHistory();
});

// Event listeners para los botones de filtro
document.querySelectorAll('[data-filter]').forEach(button => {
    button.addEventListener('click', (e) => {
        // Actualizar UI
        document.querySelectorAll('[data-filter]').forEach(btn => 
            btn.classList.remove('active'));
        e.target.classList.add('active');
        
        // Aplicar filtro
        currentHistoryFilter = e.target.dataset.filter;
        renderHistory();
    });
});

// Asegurarse de que el select de postsPerPage tenga el valor correcto por defecto
document.addEventListener('DOMContentLoaded', () => {
    const postsPerPageSelect = document.getElementById('postsPerPage');
    if (postsPerPageSelect) {
        postsPerPageSelect.value = paginationState.postsPerPage.toString();
    }
});

// Agregar función para actualizar el historial del usuario
function updateUserHistory(allPosts) {
    userHistory.posts = [];
    userHistory.replies = [];
    
    allPosts.forEach(post => {
        if (post.authorId === currentUser.uid) {
            userHistory.posts.push({ ...post, type: 'own' });
        }
        
        if (post.replies?.some(reply => reply.authorId === currentUser.uid)) {
            userHistory.replies.push({ ...post, type: 'replied' });
        }
    });

    // Actualizar vista del historial si está activo
    if (document.getElementById('myHistory').classList.contains('active')) {
        renderHistory();
    }
}

// Agregar event listener para el filtro por categoría
document.getElementById('categoryFilter').addEventListener('change', function(e) {
    const selectedCategory = e.target.value;
    const postsContainer = document.querySelector('.posts-container');
    const allPosts = document.querySelectorAll('.post-card');
    
    allPosts.forEach(post => {
        if (!selectedCategory || post.dataset.category === selectedCategory) {
            post.style.display = '';
        } else {
            post.style.display = 'none';
        }
    });
    
    // Actualizar el contador
    const visiblePosts = document.querySelectorAll('.post-card:not([style*="display: none"])');
    updatePostsCounter(1, visiblePosts.length, allPosts.length);
});

// Add function to clone form for mobile view
document.addEventListener('DOMContentLoaded', () => {
    const originalForm = document.querySelector('#newPostForm form');
    const mobileFormContainer = document.getElementById('mobileNewPostForm');
    
    if (originalForm && mobileFormContainer) {
        // Clone the form
        const mobileForm = originalForm.cloneNode(true);
        
        // Update IDs to avoid duplicates
        mobileForm.id = 'mobileNewPostFormContent';
        
        // Add to mobile container
        mobileFormContainer.appendChild(mobileForm);
        
        // Add submit handler to mobile form
        mobileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleNewPost(e, true);
            bootstrap.Modal.getInstance(document.getElementById('newPostModal')).hide();
        });
    }
});

// Modify the post submission to work with both forms
async function handleNewPost(e, isMobile = false) {
    e.preventDefault();
    
    try {
        // Determinar el formulario correcto
        const formId = isMobile ? 'mobileNewPostFormContent' : 'newPostForm';
        const form = document.getElementById(formId);
        
        if (!form) {
            throw new Error(`Formulario no encontrado: ${formId}`);
        }

        // Obtener elementos dentro del contexto del formulario
        const categoryElement = form.querySelector('#PostCategory, #mobilePostCategory');
        const titleElement = form.querySelector('#PostTitle, #mobilePostTitle');
        const contentElement = form.querySelector('#PostContent, #mobilePostContent');
        const allowContactElement = form.querySelector('#AllowContact, #mobileAllowContact');

        // Verificación más detallada
        if (!categoryElement) {
            console.error('Formulario encontrado:', form);
            console.error('Elementos disponibles:', form.innerHTML);
            throw new Error('Campo de categoría no encontrado');
        }

        // Verificar cada elemento individualmente y mostrar mensajes específicos
        if (!categoryElement) {
            console.error('Elemento no encontrado:', `${prefix}PostCategory`);
            throw new Error('Campo de categoría no encontrado. ID: ' + `${prefix}PostCategory`);
        }
        if (!titleElement) {
            console.error('Elemento no encontrado:', `${prefix}PostTitle`);
            throw new Error('Campo de título no encontrado');
        }
        if (!contentElement) {
            console.error('Elemento no encontrado:', `${prefix}PostContent`);
            throw new Error('Campo de contenido no encontrado');
        }

        // Validar valores
        if (!categoryElement.value) throw new Error('Por favor seleccione una categoría');
        if (!titleElement.value.trim()) throw new Error('Por favor ingrese un título');
        if (!contentElement.value.trim()) throw new Error('Por favor ingrese el contenido de la publicación');

        const formData = {
            category: categoryElement.value,
            title: titleElement.value.trim(),
            content: contentElement.value.trim(),
            authorId: currentUser?.uid,
            authorName: currentUser?.email?.split('@')[0] || 'Usuario',
            createdAt: new Date().toISOString(),
            replies: [],
            allowContact: allowContactElement?.checked || false
        };

        // Si se permite el contacto, agregar la información
        if (formData.allowContact) {
            formData.contact = {
                whatsapp: document.getElementById(`${prefix}ContactWhatsapp`)?.value || null,
                telegram: document.getElementById(`${prefix}ContactTelegram`)?.value || null,
                instagram: document.getElementById(`${prefix}ContactInstagram`)?.value || null,
                facebook: document.getElementById(`${prefix}ContactFacebook`)?.value || null
            };
        }

        await addDoc(collection(db, 'forum_posts'), formData);
        e.target.reset();
        showSuccess('Publicación creada exitosamente');
        
        // Cerrar el modal si estamos en móvil
        if (isMobile) {
            const modal = bootstrap.Modal.getInstance(document.getElementById('newPostModal'));
            if (modal) {
                modal.hide();
            }
        }
    } catch (error) {
        console.error('Error en handleNewPost:', error);
        showError(error.message || 'Error al crear la publicación');
    }
}

// Agregar la función para alternar la visibilidad de las respuestas
window.toggleReplies = function(postId) {
    const repliesSection = document.getElementById(`replies-${postId}`);
    const button = document.querySelector(`[data-post-id="${postId}"] .replies-toggle`);
    
    if (repliesSection.style.display === 'none') {
        repliesSection.style.display = 'block';
        repliesSection.style.animation = 'fadeIn 0.3s ease-in';
        button.classList.add('active');
    } else {
        repliesSection.style.display = 'none';
        button.classList.remove('active');
    }
};

// Event listeners
document.getElementById('categoryFilter').addEventListener('change', () => {
    paginationState.currentPage = 1;
    loadPosts();
});

document.getElementById('sortPosts').addEventListener('change', () => {
    paginationState.currentPage = 1;
    loadPosts();
});
