var tipuesearch = {"pages":[{"title":"Django源码解读之ListView","text":"本文以从url解析到数据渲染到前端这个流程来对Django的ListView源码进行解读, 通过本文可以更深入理解ListView中各个属性的用法. 环境: Django2.2版本 1. ListView的方法解析顺序(MRO)和属性 MRO: ListView MultipleObjectTemplateResponseMixin TemplateResponseMixin BaseViewList MultipleObjectMixin ContextMixin View 属性: 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 allow_empty = True content_type = None context_object_name = None extra_context = None http_method_names = [ 'get' , 'post' , 'put' , 'patch' , 'delete' , 'head' , 'options' , 'trace' ] model = None ordering = None page_kwarg = 'page' paginate_by = None paginate_orphans = 0 paginator_class = < class 'django.core.paginator.Paginator' > queryset = None response_class = < class 'django.template.response.TemplateResonse' > template_engine = None template_name = None template_name_suffix = '_list' 2. 从路由解析说起 urlpatterns = [ path ( r '' , views . IndexListView . as_view (), name = 'index' ), # path ( r '' , views . index , name = 'index' ), ] path第二个参数为函数, 我们写函数视图时直接传函数视图, 为什么写类视图就要写as_view()呢? as_view在父类View中, 下面是as_view的源码: 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 @classonlymethod def as_view ( cls , ** initkwargs ): \"\"\"Main entry point for a request-response process.\"\"\" for key in initkwargs : if key in cls . http_method_names : raise TypeError ( \"You tried to pass in the %s method name as a \" \"keyword argument to %s (). Don't do that.\" % ( key , cls . __name__ )) if not hasattr ( cls , key ): raise TypeError ( \" %s () received an invalid keyword %r . as_view \" \"only accepts arguments that are already \" \"attributes of the class.\" % ( cls . __name__ , key )) def view ( request , * args , ** kwargs ): self = cls ( ** initkwargs ) if hasattr ( self , 'get' ) and not hasattr ( self , 'head' ): self . head = self . get self . setup ( request , * args , ** kwargs ) if not hasattr ( self , 'request' ): raise AttributeError ( \" %s instance has no 'request' attribute. Did you override \" \"setup() and forget to call super()?\" % cls . __name__ ) return self . dispatch ( request , * args , ** kwargs ) view . view_class = cls view . view_initkwargs = initkwargs # take name and docstring from class update_wrapper ( view , cls , updated = ()) # and possible attributes set by decorators # like csrf_exempt from dispatch update_wrapper ( view , cls . dispatch , assigned = ()) return view 这里 classonlymethod 装饰器限制了as_view方法只能通过类调用, 源码大致可以分为两部分, 第一部分对请求进行判断, 第二部分定义了 view 方法并对该方法进行了一些处理后返回该方法, 所以 as_view 是个闭包, 只能通过类调用, IndexListView.as_view() 也就是调用了as_view中的view方法. 所以重点在view方法, view先创建了个类的实例, 通过 self.setup(request, *args, **kwargs) 将request和其他参数设置到实例中, 最后调用 dispatch 方法并返回, dispatch源码: 1 2 3 4 5 6 7 8 9 def dispatch ( self , request , * args , ** kwargs ): # Try to dispatch to the right method; if a method doesn't exist, # defer to the error handler. Also defer to the error handler if the # request method isn't on the approved list. if request . method . lower () in self . http_method_names : handler = getattr ( self , request . method . lower (), self . http_method_not_allowed ) else : handler = self . http_method_not_allowed return handler ( request , * args , ** kwargs ) dispatch 对请求进行分发, 最终调用相应的请求方法并返回, 比如用GET请求, handler = get 然后调用 handler(request, *args, **kwargs) 也就是 get(request, *args, **kwargs) . 3. ListView中的get方法 父类BaseListView中实现了get方法, 下面是源码: 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 def get ( self , request , * args , ** kwargs ): self . object_list = self . get_queryset () allow_empty = self . get_allow_empty () if not allow_empty : # When pagination is enabled and object_list is a queryset, # it's better to do a cheap query than to load the unpaginated # queryset in memory. if self . get_paginate_by ( self . object_list ) is not None and hasattr ( self . object_list , 'exists' ): is_empty = not self . object_list . exists () else : is_empty = not self . object_list if is_empty : raise Http404 ( _ ( \"Empty list and ' %(class_name)s .allow_empty' is False.\" ) % { 'class_name' : self . __class__ . __name__ , }) context = self . get_context_data () return self . render_to_response ( context ) 3.1 get_queryset获取数据库数据 get方法中先调用了 get_queryset() , 该方法在父类MultipleObjectMixin中: 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 def get_queryset ( self ): \"\"\" Return the list of items for this view. The return value must be an iterable and may be an instance of `QuerySet` in which case `QuerySet` specific behavior will be enabled. \"\"\" if self . queryset is not None : queryset = self . queryset if isinstance ( queryset , QuerySet ): queryset = queryset . all () elif self . model is not None : queryset = self . model . _default_manager . all () else : raise ImproperlyConfigured ( \" %(cls)s is missing a QuerySet. Define \" \" %(cls)s .model, %(cls)s .queryset, or override \" \" %(cls)s .get_queryset().\" % { 'cls' : self . __class__ . __name__ } ) ordering = self . get_ordering () if ordering : if isinstance ( ordering , str ): ordering = ( ordering ,) queryset = queryset . order_by ( * ordering ) return queryset 该方法需要在视图中定义了queryset属性或者model属性, 默认的queryset和model属性都为None.如果定义了queryset那么返回的就是写的queryset, 否则返回的是 model名.objects.all() . 所以如果要修改获取的数据的话那么可以重写该方法. get_ordering() 排序方法返回了实例的ordering属性, 默认为None, ordering可以是str或者元组, 从代码可以看出如果是str那么这里将会转化为元祖, 然后将queryset排序后返回. 3.2 allow_empty get_allow_empty() 返回实例的allow_empty属性, 默认为None. allow_empty=True时允许返回objects_list为空的列表, allow_empty为None或False时返回Http404, 从代码可以看出. 3.3 get_context_data()获取上下文 父类MultipleObjectMixin和ContextMixin都定义了该方法, 按照ListView的Mro先找到父类MultipleObjectMixin中的方法, 代码如下: 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 def get_context_data ( self , * , object_list = None , ** kwargs ): \"\"\"Get the context for this view.\"\"\" queryset = object_list if object_list is not None else self . object_list page_size = self . get_paginate_by ( queryset ) context_object_name = self . get_context_object_name ( queryset ) if page_size : paginator , page , queryset , is_paginated = self . paginate_queryset ( queryset , page_size ) context = { 'paginator' : paginator , 'page_obj' : page , 'is_paginated' : is_paginated , 'object_list' : queryset } else : context = { 'paginator' : None , 'page_obj' : None , 'is_paginated' : False , 'object_list' : queryset } if context_object_name is not None : context [ context_object_name ] = queryset context . update ( kwargs ) return super () . get_context_data ( ** context ) queryset为传入的object_list参数或者实例的object_list, 也就是前面 get_queryset() 获取的数据. get_paginate_by(queryset) 方法返回了实例的paginate_by属性, 默认为None, 该属性定义了分页每页的大小. context_object_name是用于前端对后端获取的queryset的命名, 用模板语言的就是{{ news_list }}这样. 实例context_object_name属性默认为None, get_context_object_name() 方法返回自定义的context_object_name或者 model名s_list .下面是代码: 1 2 3 4 5 6 7 8 def get_context_object_name ( self , object_list ): \"\"\"Get the name of the item to be used in the context.\"\"\" if self . context_object_name : return self . context_object_name elif hasattr ( object_list , 'model' ): return ' %s _list' % object_list . model . _meta . model_name else : return None 回到get_context_data方法, 如果定义了分页属性paginate_by, 那么将调用 paginate_queryset(queryset, page_size) 对queryset进行分页, 下面是代码: 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 def paginate_queryset ( self , queryset , page_size ): \"\"\"Paginate the queryset, if needed.\"\"\" paginator = self . get_paginator ( queryset , page_size , orphans = self . get_paginate_orphans (), allow_empty_first_page = self . get_allow_empty ()) page_kwarg = self . page_kwarg page = self . kwargs . get ( page_kwarg ) or self . request . GET . get ( page_kwarg ) or 1 try : page_number = int ( page ) except ValueError : if page == 'last' : page_number = paginator . num_pages else : raise Http404 ( _ ( \"Page is not 'last', nor can it be converted to an int.\" )) try : page = paginator . page ( page_number ) return ( paginator , page , page . object_list , page . has_other_pages ()) except InvalidPage as e : raise Http404 ( _ ( 'Invalid page ( %(page_number)s ): %(message)s ' ) % { 'page_number' : page_number , 'message' : str ( e ) }) get_paginator 使用实例的paginator_class类创建一个Paginator实例对象, 默认的paginator_class是Django自带的Paginator, 如对Django的分页不了解请查询相关文档. page_kwarg参数默认为'page', 该参数是对前端传过来的页数的命名, 第7行获取接受的页码数, 也就是请求的第几页.然后从15行开始从分页对象paginator获取相关页的数据, 然后以元祖的形式返回, 返回的依次是分页器paginator, paginator的Page对象, 请求页的数据page.object_list, 是否有上一页和下一页. 回到get_context_data方法, 更新了context后最后返回了super().get_context_data方法, 根据MRO是ContextMixin中的get_context_data方法, 代码如下: 1 2 3 4 5 def get_context_data ( self , ** kwargs ): kwargs . setdefault ( 'view' , self ) if self . extra_context is not None : kwargs . update ( self . extra_context ) return kwargs 可以看到该方法在上下文中添加了ListView实例对象还有实例的extra_context, 因此如果要添加新的上下文除了重写get_context_data方法外, 还可以在实例中定义extra_context属性. 3.4 render_to_response渲染到前端 回到get方法, 最后返回了render_to_response, render_to_response代码如下: 1 2 3 4 5 6 7 8 9 10 11 12 13 14 def render_to_response ( self , context , ** response_kwargs ): \"\"\" Return a response, using the `response_class` for this view, with a template rendered with the given context. Pass response_kwargs to the constructor of the response class. \"\"\" response_kwargs . setdefault ( 'content_type' , self . content_type ) return self . response_class ( request = self . request , template = self . get_template_names (), context = context , using = self . template_engine , ** response_kwargs ) 该方法创建了一个TemplateResponse对象并返回, 因为默认的response_class属性是django的TemplateResponse类, 这里需要说明的 get_template_names() 方法, 按照MRO在MultipleObjectTemplateResponseMixin类中找到: 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 def get_template_names ( self ): \"\"\" Return a list of template names to be used for the request. Must return a list. May not be called if render_to_response is overridden. \"\"\" try : names = super () . get_template_names () except ImproperlyConfigured : # If template_name isn't specified, it's not a problem -- # we just start with an empty list. names = [] # If the list is a queryset, we'll invent a template name based on the # app and model name. This name gets put at the end of the template # name list so that user-supplied names override the automatically- # generated ones. if hasattr ( self . object_list , 'model' ): opts = self . object_list . model . _meta names . append ( \" %s / %s%s .html\" % ( opts . app_label , opts . model_name , self . template_name_suffix )) elif not names : raise ImproperlyConfigured ( \" %(cls)s requires either a 'template_name' attribute \" \"or a get_queryset() method that returns a QuerySet.\" % { 'cls' : self . __class__ . __name__ , } ) return names 该方法先调用父类的get_template_names()方法, 在TemplateResponseMixin中可以找到: 1 2 3 4 5 6 7 8 9 10 11 def get_template_names ( self ): \"\"\" Return a list of template names to be used for the request. Must return a list. May not be called if render_to_response() is overridden. \"\"\" if self . template_name is None : raise ImproperlyConfigured ( \"TemplateResponseMixin requires either a definition of \" \"'template_name' or an implementation of 'get_template_names()'\" ) else : return [ self . template_name ] 可以看出TemplateResponseMixin中的get_template_names方法返回的是template_name属性或者抛出异常, 回到MultipleObjectTemplateResponseMixin中, 可以看出names这个列表添加了个路径, 默认的template_name_suffix属性是 _list , 所以默认的路径是 你的app/model名_list.html , 所以就算template_name不写也是可以渲染的, 只要路径正确. TemplateResponse接收的template为列表时, 将会一个个试着列表中的路径, 直到成功, 所以写了template_name将会先渲染template_name的路径, 失败后才渲染默认路径. 4. 总结 常用的方法和属性 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 # model , queryset 属性都用于获取数据, 可重写 get_queryset 方法 queryset = None model = None # 是否 queryset 为空 allow_empty = True # 渲染的模板名 template_name = None # 在上下文中对获取的 queryset 重命名, 默认的 queryset 名为 model 名 s_list context_object_name = None # 用于添加额外的上下文 extra_context = None # 排序 ordering = None # 分页的大小 paginate_by = None #重写方法获取 queryset def get_queryset ( self ) : # 获取 queryset 的代码 return queryset #重写方法添加额外上下文 def get_context_data ( self , * , object_list = None , ** kwargs ) : context = super () . get_context_data () # 添加上下文的代码 return context","tags":"Django","url":"/blog/2019_09_23/listview-source"},{"title":"本地连接到远程服务器上的MySql数据库","text":"需求: 让本地连接到远程服务器上的MySql数据库以便操作远程Mysql 远程服务器环境: ubuntu 16.04, MySql 5.7 一.在远程服务器启动并登录MySql service mysql start mysql - uroot - p 二.设置权限 网上有方法说进入到mysql数据库中的user表, 将 localhost root 改为 @ root , 这里不推荐这样做, 这样的话你还是得需要一个 localhost root 来让本地登录, 因此这里推荐的是授权. 命令格式 如下: Grant [ previleges ] On [ dbName ] . [ tableName ] To [ username ] @ [ hostname ] Identified By \"password\" With Grant Option ; 说明下上面变量的意义: previleges: 授予的权限, 这里就不列举出所有可填权限了, 所有权限可用 All Previleges dbName: 指定授权的数据库,可用 * 代表所有数据库 tableName: 指定授权的表, 可用 * 代表指定数据库下的所有表 username: 登录到这个数据库的远程主机所要填写的登录用户名 hostname: 允许登录到这个数据库的远程主机的, 可以是ip或域名, 用 % 代表任何地方都能登录 password: 登录到这个数据库的远程主机所要填写的密码 我写的是 Grant All Previleges On * . * To 'root' @ '%' Identified By '123456' With Grant Option ; 意思就是任何主机只要用户为 root , 密码为 123456 就可以访问这个Mysql数据库, 且具有所有数据库和所有数据库表的所有权限. 接下来还需要刷新下权限: Flush Privileges ; 三. 修改mysql的配置文件 在 /etc/mysql/mysql.conf.d/ 目录下的 mysqld.cnf 文件,将 bind - address = 127 . 0 . 0 . 1 这一行注释掉, 然后重启mysql服务: service mysql restart 现在可以在自己的主机上连到远程服务器上的MySql了, 可以用Navicat, 还支持数据传送等功能呢, 也可以用命令行试一下: mysql - h 你的远程服务器地址 - uroot - p","tags":"数据库","url":"/blog/2019_09_10/connet_to_remote_mysql"},{"title":"对Python中super的理解","text":"前言 以前一直以为super就是调用父类方法嘛, 直到最近回顾了Python的MRO才发觉没这么简单, super并不是调用父类的方法, 而是调用了MRO中下一个类的方法. 环境: Python3.6 单继承 在单继承中 super 就像我以前理解的那样, 主要用来调用父类方法: 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 class A : def __init__ ( self ): self . n = 2 def add ( self , m ): print ( 'self is {0} @A.add' . format ( self )) self . n += m class B ( A ): def __init__ ( self ): self . n = 3 def add ( self , m ): print ( 'self is {0} @B.add' . format ( self )) super () . add ( m ) self . n += 3 b = B () b . add ( 2 ) print ( b . n ) 执行结果如下: 1 2 3 self is < __main__ . B object at 0x106c49b38 > @B.add self is < __main__ . B object at 0x106c49b38 > @A.add 8 之前在别的教程看到说 super 会找到当前类的父类, 然后将实例转换为父类实例, 但是从上面例子可以看到并不是这样, 实例一直都是当前类的实例, 所以结果是 8 而不是 7 多继承 我们用菱形继承关系来举例说明多继承中的 super : 代码如下: 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 class A : def __init__ ( self ): self . n = 2 def add ( self , m ): print ( 'self is {0} @A.add' . format ( self )) self . n += m class B ( A ): def __init__ ( self ): self . n = 3 def add ( self , m ): print ( 'self is {0} @B.add' . format ( self )) super () . add ( m ) self . n += 3 class C ( A ): def __init__ ( self ): self . n = 4 def add ( self , m ): print ( 'self is {0} @C.add' . format ( self )) super () . add ( m ) self . n += 4 class D ( B , C ): def __init__ ( self ): self . n = 5 def add ( self , m ): print ( 'self is {0} @D.add' . format ( self )) super () . add ( m ) self . n += 5 d = D () d . add ( 2 ) print ( d . n ) 这次的输出如下: 1 2 3 4 5 self is < __main__ . D object at 0x10ce10e48 > @D.add self is < __main__ . D object at 0x10ce10e48 > @B.add self is < __main__ . D object at 0x10ce10e48 > @C.add self is < __main__ . D object at 0x10ce10e48 > @A.add 19 让我们来看看这是怎么发生的, 为什么结果是 19 . 首先要明确的是: 类D的MRO为 D->B->C->A' , 可以通过 D.__mro__ 查看 super并不会进行实例转换, 这里的实例一直是类D的实例, 上面输出可以看出. 既然实例一直没变, 那么A, B, C类add方法中的self.n其实也就是d.n了. python3中D类的 super().add(m) 等价于 super(D, self).add(m) , 这点下一小节会用到. 当我们调用 d.add(2) , 执行到D中add方法中的super的时候, super会通过MRO找到类D的下一类, 也就是类B. 执行到B中add方法中的super, super又通过原先的那个MRO(因为实例一直是类D的实例, 所以也就是类D的MRO)找到类B的下一个类( 这里要注意的是super并不是找到B的父类 ), 也就是类C, 依次类推, 最终结果便是 19 了 super其实是个类 没错, super是个类而不是函数, 当我们调用 super() 的时候实际上是实例化了一个 super 类, 它包含了两个重要的信息: 一个MRO以及MRO中的一个类. super() 接收两个参数, 当我们这样调用时: super ( a_type , obj ) 实例化的super类会保存 type(obj) 的MRO, 同时 isinstance(obj, a_type)==True 判断obj为a_type类型(想象一下, 如果是False那么type(obj)的MRO中根本找不到a_type), 然后从MRO中a_type后面开始搜索, 用上面的代码举例说明一下可能会更方便理解. 当我们执行到 类D 的 super().add(m) 的时候(其实等价于 super(D, self).add(m) ), 实例化的super类会保存type(self)的MRO(type(self)==Class D, D的MRO为 D->B->C->A ), 同时 isinstance(self, D)==True , 然后从MRO中D后面可以搜索, 也就是 B->C-A . super还可以这样调用: super ( type1 , type2 ) super类会保存type2的MRO, 然后从MRO中type1后面可以搜索, 同时 issubclass(type2, type1)==True 判断type2是否是type1的子类, 按上面的代码举个例子, 调用: super ( C , D ). add ( m ) D的MRO为 D->B->C->A , 那么上述调用只会从 C 后面找, 也就是只能从 A 中找","tags":"Python","url":"/blog/2019_09_09/python-super"},{"title":"对Python中多继承的MRO的理解","text":"什么是函数解析顺序(MRO)? 方法解析顺序(MRO, Method-Resolution-Roder)定义了Python多继承的情况下, 解释器查找函数解析的具体顺序. Python各版本中的MRO 在2.2版本以前只有经典类(Old-style Class), 类使用深度优先搜索(DFS, Depth-First-Search). 在2.2版本引入新式类(New-style Class), 经典类还是使用DFS, 新式类则使用广度优先算法(BFS, Breadth-First-Search), BFS仅在2.2版本中使用过. 在2.2版本以后python 3版本以前, 新式类采用C3线性化算法, 经典类采用深度优先算法. python 3以后类都是新式类, 使用C3线性化算法. 总结: 经典类都是DFS算法, 新式类除了在2.2版本中使用过BFS算法, 其他版本都是C3算法. 先谈谈DFS和BFS 先看看以下菱形继承关系: B和C继承自A, D继承自B, C. 代码如下: 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 #python2中 Class A : def who ( self ): print 'I am class A' Class B ( A ): pass Class C ( A ): def who ( self ): print 'I am class C' Class D ( B , C ): pass d = D () d . who () #结果是'I am class A' 按照DFS算法, 解析顺序是 D->B->A->C->A , 之前解析过的类A不会再解析, 所以最终是 D->B->A->C . 这样会出现什么问题呢? 你可以在C类中重写其父类A中的方法, 但是你永远访问不到你重写的方法, 因为解析到A就找到了, 所以这就是经典类使用DFS算法的缺陷. 再来说说2.2版本中新式类使用的BFS算法, 还是根据上图的菱形继承关系, 解析顺序是 D->B->C->A , BFS算法解决了经典类中DFS子类无法重写父类的问题, 但是这又引起了另一个问题, 看看正常的继承方式: 代码如下: 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 #环境为python2.2 Class A ( object ): def who ( self ): print 'I am class A' Class B ( object ): pass Class C ( A ): pass Class D ( B ): def who ( self ): print 'I am class D' Class E ( C , D ): pass e = E () e . who () #结果应该是'I am class D', 这里我没装2.2版本的, 但应该是这样, 有兴趣的可以测试下. 我们在类A和类D中实现同一个方法. 按照2.2版本新式类的BFS算法, 解析顺序是 E->C->D->A->B . 这里A类是C类的唯一父类, 这种情况应该从唯一父类中找, 但BFS算法却先找到D类中的方法, 这样违背了单调性原则, 所有BFS仅存在于2.2一个版本. C3线性化算法 Python在2.3及之后版本的新式类都使用了C3线性化算法(C3 linearization), C3算法解决了DFS和BFS所不能解决的问题, 下面我将详细谈谈C3算法. 这里先给不想看算法计算过程的小伙伴一个方便的C3算法解析过程: 按照上面的菱形继承关系图, 我们先用深度优先遍历得到MRO为 D->B->A->C->A(先别把最后的A去掉) , 然后我们看到 D->B->A->C->A 中的第一个A在后面出现过, 我们就把这个A去掉, 最终的MRO就是 D->B->C->A . 这个就是C3算法得出的MRO. 也就是说, 对于多继承关系, 先用深度优先遍历(先不把解析过的去掉)得到一个MRO, 然后再根据这个MRO从左往右遍历, 只要当前的类出现在后面, 我们就把当前的类删掉, 也就是说对于重复出现的类我们只保留它的最后一个位置, 最终得到的就是C3算法得出的MRO了. C3线性化算法的计算过程 下面讲讲C3算法的计算过程. 介绍算法前首先约定需要使用的符号. 用 \\([C_1C_2C_3\\cdots C_N]\\) 来表示包含N个类的列表, 并令 $$ head([C_1C_2C_3 \\cdots C_N]) = [C_1] %就是取第一个 $$ $$ tail([C_1C_2C_3 \\cdots C_N]) = [C_2C_3\\cdots C_N] %就是去掉第一个 $$ $$ [C_1] + [C_2C_3 \\cdots C_N] = [C_1C_2 \\cdots C_N] $$ 也就是 \\(head()\\) 取里面第一个, \\(tail\\) 取除了第一个. 假设类 \\(C\\) 继承自父类 \\(B_1,\\cdots,B_N\\) , 那么根据C3线性化算法, 类 \\(C\\) 的解析列表通过以下公式决定: $$ L[C(B_1B_2 \\cdots B_N)] = [C] + merge(L[B_1], L[B_2], \\cdots, L[B_N], B_1, B_2, \\cdots , B_N) $$ 说明一下, \\(merge\\) 公式左部分是类 \\(C\\) 的所有父类的解析列表( \\(L[B_1]\\) 表示类 \\(B_1\\) 的解析列表), 也就是每个父类的解析列表. 右部分是类 \\(C\\) 的所有父类. 所以这个公式表明 \\(C\\) 的解析列表是通过对其父类的解析列表和其父类做 \\(merge\\) 操作得到的, 那么接下来就介绍重点的 \\(merge\\) , 分为以下步骤: 取 \\(merge\\) 中的第一个列表记为当前列表 \\(K\\) . (相当于取类C的第一个父类的解析列表) 令 \\(h = head(K)\\) , 如果 \\(h\\) 没有出现在其他任何列表的 \\(tail\\) 中,就将其加入 \\(C\\) 的解析列表中,并将其从 \\(merge\\) 中所有地方移除(包括列表和类), 之后重复步骤2. 否则,设置 \\(K\\) 为 \\(merge\\) 中的下一个列表, 并重复2中的操作. 如果 \\(merge\\) 中所有类都被移除, 则创建类成功; 如果不能找到下一个 \\(h\\) , 则拒绝创建类并抛出异常. 举例说明上述步骤, 假设有以下的类继承关系: 1 2 3 4 5 6 7 #python3环境 #交叉继承, 会抛异常 class X : pass class Y : pass class A ( X , Y ): pass class B ( Y , X ): pass class F ( A , B ): pass 首先有 \\(L[X] = [X]\\) , \\(L[Y] = [Y]\\) , 然后可以得到: $$ L[A] = [A] + merge(L[X], L[Y], X, Y) = [A, X, Y] $$ $$ L[B] = [B] + merge(L[Y], L[X], Y, X) = [B, Y, X] $$ 根据公式: $$ L[F(A, B)] = [F] + merger(L[A], L[B], A, B) = [F] + merge([A, X, Y], [B, Y, X], A, B) $$ 按1, 2步骤有 \\(K = L[A]\\) , \\(h = head(L[A]) = A\\) , 判断到 \\(A\\) 不在其他任何列表的 \\(tail\\) 中( \\(tail([B, Y, X]) = [Y, X]\\) ), 于是我们将 \\(A\\) 加入到类 \\(F\\) 的解析列表中(同时将A从所有列表中删除), 得到: $$ L[F] = [F, A] + merge([X, Y], [B, Y, X], B) $$ 按照步骤2, 此时 \\(K = L[A] = L[X, Y]\\) (上一步已将A移除), \\(h = head(K) = X\\) , 此时发现 \\(X\\) 不满足要求 ( \\(X\\) 出现在 \\(tail([B, Y, X]) = [Y, X]\\) 中), 根据步骤3令 \\(K = [B, Y, X]\\) , \\(h = head(K) = B\\) , \\(B\\) 满足要求因此将 \\(B\\) 加入到C的解析列表中并将其中 \\(merge\\) 中所有地方移除, 得到: $$ L[F] = [F, A, B] + merge([X, Y], [Y, X]) $$ 继续步骤2, 当前 \\(K = [Y, X]\\) (上一步已将B删除), \\(h = head(K) = Y\\) , 显然 \\(Y\\) 不满足要求, 由于 \\(merge\\) 没有下一个列表了, 所以无法继续选择 \\(h\\) , 根据步骤4, 类F创建失败并抛出异常. 来自wiki的更为复杂的继承例子 代码如图: 1 2 3 4 5 6 7 8 9 10 11 12 #python3环境 class O : pass class C ( O ): pass class A ( O ): pass class B ( O ): pass class D ( O ): pass class E ( O ): pass class K1 ( C , A , B ): pass class K3 ( A , D ): pass class K2 ( B , D , E ): pass class Z ( K1 , K3 , K2 ): pass print ( Z . __mro__ ) #输出的mro与下面结论一样 按照我们上面的C3算法解析过程, 先深度遍历再取重复的类最后的位置, Z的MRO先深度遍历是: Z->K1->C->O->A->O->B->O->K3->A->O->D->O->K2->B->O->D->O->E->O . 对于重复出现的类只保存最后的位置, 所以最终Z的MRO顺序应该是: Z->K1->C->K3->A->K2->B->D->E->O 我们再通过计算过程验证下看看是不是这样: $$ L[O] = [O] $$ $$ L[C(O)] = [C] + merge(L[O], O) = [C, O] $$ $$ L[A(O)] = [A] + merge(L[O], O) = [A, O] $$ $$ L[B(O)] = [B] + merge(L[O], O) = [B, O] $$ $$ L[D(O)] = [D] + merge(L[O], O) = [D, O] $$ $$ L[E(O)] = [E] + merge(L[O], O) = [E, O] $$ 上面的结果比较容易得到. $$ \\begin{align} L[K1(C, A, B)] &= [K1] + merge(L[C], L[A], L[B], C, A, B) \\\\ &= [K1] + merge([C, O], [A, O], [B, O], C, A, B)\\\\ &= [K1, C] + merge([O], [A, O], [B, O], A, B)\\\\ &= [K1, C, A] + merge([O], [O], [B, O], B)\\\\ &= [K1, C, A, B] + merge([O], [O], [O])\\\\ &= [K1, C, A, B, O] \\end{align} $$ $$ \\begin{align} L[K3(A, D)] &= [K3] + merge(L[A], L[D], A, D) \\\\ &= [K3] + merge(L[A, O], L[D, O], A, D)\\\\ &= [K3, A] + merge([O], L[D, O], D)\\\\ &= [K3, A, D] + merge([O], [O])\\\\ &= [K3, A, D, O] \\end{align} $$ $$ \\begin{align} L[K2(B, D, E)] &= [K2] + merge(L[B], L[D], L[E], B, D, E) \\\\ &= [K2] + merge([B, O], [D, O], [E, O], B, D, E)\\\\ &= [K2, B] + merge([O], [D, O], [E, O], D, E)\\\\ &= [K2, B, D] + merge([O], [O], [E, O], E)\\\\ &= [K2, B, D, E] + merge([O], [O], [O])\\\\ &= [K2, B, D, E, O] \\end{align} $$ 所以最终Z的MRO列表为: $$ \\begin{align} L[Z(K1, K3, K2] &= [Z] + merge(L[K1], L[K3], L[K2], K1, K3, K2)\\\\ &= [Z] + merge([K1, C, A, B, O], [K3, A, D, O], [K2, B, D, E, O], K1, K3, K2) \\\\ &= [Z, K1] + merge([C, A, B, O], [K3, A, D, O], [K2, B, D, E, O], K3, K2)\\\\ &= [Z, K1, C] + merge([A, B, O], [K3, A, D, O], [K2, B, D, E, O], K3, K2)\\\\ &= [Z, K1, C, K3] + merge([A, B, O], [A, D, O], [K2, B, D, E, O], K2)\\\\ &= [Z, K1, C, K3, A] + merge([B, O], [D, O], [K2, B, D, E, O], K2)\\\\ &= [Z, K1, C, K3, A, K2] + merge([B, O], [D, O], [B, D, E, O])\\\\ &= [Z, K1, C, K3, A, K2, B] + merge([O], [D, O], [D, E, O])\\\\ &= [Z, K1, C, K3, A, K2, B, D] + merge([O], [O], [E, O])\\\\ &= [Z, K1, C, K3, A, K2, B, D, E] + merge([O], [O], [O])\\\\ &= [Z, K1, C, K3, A, K2, B, D, E, O] \\end{align} $$ 最终得到的结果与我们上面得出的一致. if (!document.getElementById('mathjaxscript_pelican_#%@#$@#')) { var align = \"center\", indent = \"0em\", linebreak = \"false\"; if (false) { align = (screen.width < 768) ? \"left\" : align; indent = (screen.width < 768) ? \"0em\" : indent; linebreak = (screen.width < 768) ? 'true' : linebreak; } var mathjaxscript = document.createElement('script'); mathjaxscript.id = 'mathjaxscript_pelican_#%@#$@#'; mathjaxscript.type = 'text/javascript'; mathjaxscript.src = 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.3/latest.js?config=TeX-AMS-MML_HTMLorMML'; var configscript = document.createElement('script'); configscript.type = 'text/x-mathjax-config'; configscript[(window.opera ? \"innerHTML\" : \"text\")] = \"MathJax.Hub.Config({\" + \" config: ['MMLorHTML.js'],\" + \" TeX: { extensions: ['AMSmath.js','AMSsymbols.js','noErrors.js','noUndefined.js'], equationNumbers: { autoNumber: 'none' } },\" + \" jax: ['input/TeX','input/MathML','output/HTML-CSS'],\" + \" extensions: ['tex2jax.js','mml2jax.js','MathMenu.js','MathZoom.js'],\" + \" displayAlign: '\"+ align +\"',\" + \" displayIndent: '\"+ indent +\"',\" + \" showMathMenu: true,\" + \" messageStyle: 'normal',\" + \" tex2jax: { \" + \" inlineMath: [ ['\\\\\\\\(','\\\\\\\\)'] ], \" + \" displayMath: [ ['$$','$$'] ],\" + \" processEscapes: true,\" + \" preview: 'TeX',\" + \" }, \" + \" 'HTML-CSS': { \" + \" availableFonts: ['STIX', 'TeX'],\" + \" preferredFont: 'STIX',\" + \" styles: { '.MathJax_Display, .MathJax .mo, .MathJax .mi, .MathJax .mn': {color: 'ForestGreen ! important'} },\" + \" linebreaks: { automatic: \"+ linebreak +\", width: '90% container' },\" + \" }, \" + \"}); \" + \"if ('default' !== 'default') {\" + \"MathJax.Hub.Register.StartupHook('HTML-CSS Jax Ready',function () {\" + \"var VARIANT = MathJax.OutputJax['HTML-CSS'].FONTDATA.VARIANT;\" + \"VARIANT['normal'].fonts.unshift('MathJax_default');\" + \"VARIANT['bold'].fonts.unshift('MathJax_default-bold');\" + \"VARIANT['italic'].fonts.unshift('MathJax_default-italic');\" + \"VARIANT['-tex-mathit'].fonts.unshift('MathJax_default-italic');\" + \"});\" + \"MathJax.Hub.Register.StartupHook('SVG Jax Ready',function () {\" + \"var VARIANT = MathJax.OutputJax.SVG.FONTDATA.VARIANT;\" + \"VARIANT['normal'].fonts.unshift('MathJax_default');\" + \"VARIANT['bold'].fonts.unshift('MathJax_default-bold');\" + \"VARIANT['italic'].fonts.unshift('MathJax_default-italic');\" + \"VARIANT['-tex-mathit'].fonts.unshift('MathJax_default-italic');\" + \"});\" + \"}\"; (document.body || document.getElementsByTagName('head')[0]).appendChild(configscript); (document.body || document.getElementsByTagName('head')[0]).appendChild(mathjaxscript); }","tags":"Python","url":"/blog/2019_09_08/python-mro"},{"title":"Github Page和Pelican搭建个人博客,并使用主题Elegant","text":"前言 什么是 Github Pages , Pelican 和 elegant ? Github pages允许你存放你的静态博客, Pelican是基于Python的, 能让你迅速创建博客骨架, elegant是一款Pelican主题. 效果预览 最近想搭建个博客网站写一些东西，最终选择了在Github上写博客, 今天刚把博客搭建完, 写一下搭建的过程还有遇到的一些问题和解决方法． 个人环境: Ubuntu 18.04, Python3.6 一. 创建Github Pages 这一步很简单, 在Github上新建个repository, name可以写作username.github.io, 比如我的是huangjiarong.github.io, 然后公开创建就可以了.参考官方网站 Github Pages 二. 安装Pelican 使用虚拟环境, 这里我用的virtualenvwrapper mkvirtualenv pelican 安装Pelican, 使用Markdown写文章的话还得安装Markdown pip install pelican pip install markdown 三. 使用Pelican 新建目录 myBlog , 然后进入目录快速创建博客 mkdir myBlog cd myBlog pelican - quickstart 执行完 pelican-quickstart 后, 会提示你输入一些博客的配置, 大多数可直接回车选择默认, 后续这些配置都可以在 pelicanconf.py 文件中修改. 执行完后的目录是这样的: blog / ├── content # 存放文章内容 ├── Makefile ├── output # 存放静态页面 ├── pelicanconf . py # 配置文件 ├── publishconf . py # 发布时的配置 └── tasks . py 接下来在 content 目录下写个 blog.md 文件,内容如下: Title : My First Blog Date : 2019 - 01 - 01 Category : Blog Slug : first My first blog . 保存,然后执行 make html 进入 output 文件夹就可以看到pelican为我们生成的html静态文件, 执行 make serve 就可以在本地 127.0.0.1:8000 查看效果, 不过默认主题不好看, 后续将会采用elegant主题, 现在先修改一下配置文件, 因为我想修改一下文章的保存路径还有url, 不然的话当文章一多的话看起来 output 文件夹会很乱, 而且不好管理. 在 pelicanconf.py 文件加入以下变量: ARTICLE_PATHS = [ 'blog' ] ARTICLE_SAVE_AS = 'blog/{date:%Y_%m_%d}/{slug}.html' ARTICLE_URL = 'blog/{date:%y_%m_%d}/{slug}.html' 然后在 content 目录下新建 blog 目录, 以后文章写在 blog 目录下, 执行 make html 后生成的文章主页将在 output/blog 文件夹下, 按日期进行分类. url也将随之改变为 blog/2019_01_01/first.html , 当然前提是以后在md文件中写上Date和Slug元信息. 每次写文章都得 make html 然后 make serve 查看效果, Pelican官方文档 提供了另一种方法 make devserver 可以将两个命令结合起来, 这样每次修改文章后保存直接刷新浏览器就能查看效果了. 四. 使用Elegant主题 Pelican默认的主题不好看, 这里我使用了Elegant主题. 在github上下载主题, 在这里我把主题放到了 myBlog 目录下, 也就是 content 的同级目录 git clone --recursive https://github.com/getpelican/pelican-themes 下载完后在 pelicanconf.py 添加 THEME = 'pelican-themes/elegant' 然后 make html , make serve 就能查看主题效果了, 这里还得配置一些主题的功能. 4.1 增加Contents 效果是该篇博客最左边的Contents这样, 参考 elegant官方文档 , 首先我们需要下载一些插件, 可以从github上获取, 这里我将插件放在 myBlog 目录下, 和 content , pelican-themes 等目录同级, 在 myBlog 目录使用以下命令: git clone --recursive https://github.com/getpelican/pelican-plugins 然后在 pelicanconf.py 加入: PLUGIN_PATHS = [ \"pelican-plugins\" ] PLUGINS = [ 'extract_toc' , ] 然后在.md文件中使用 [TOC] 就可以了. Title : My First Blog Date : 2019 - 01 - 01 Category : Blog Slug : first [ TOC ] ### My first blog . 4.2 增加文章底部上一篇下一篇功能 参考 elegant官方文档 , 插件我们都下载了, 在修改 pelicanconf.py 的PLUGINS就行了 PLUGINS = [ 'extract_toc' , 'neighbors' , ] 4.3 全局搜索功能 参考 elegant官方文档 , 修改pelicanconf.py PLUGINS = [ 'extract_toc' , 'neighbors' , 'tipue_search' ] DIRECT_TEMPLATES = [ 'index' , 'authors' , 'categories' , 'tags' , 'archives' , 'search' ] 在这里我遇到了点问题, 首先是 DIRECT_TEMPLATES 要像我写的那样, 不然你只写了search的话, 你修改了md文件里的信息后执行完 make html , 你会发现 output 里的 index.html , tags 之类的都没更新, 也就是说这些文件都不会执行更新, 因为你没写进 DIRECT_TEMPLATES 里. 其次是搜索功能是依赖于google api的jquery的, 谷歌嘛在国内意味着得科学上网, 所以要用搜索功能的话我的方法是网上下载一份2.0版本的 jquery.min.js 文件, 然后放到 pelican-themes/elegant/static/tipuesearch 目录下, 然后修改 pelican-themes/elegant/templates/search.html 文件, 将里面链接到googleapi的jquery文件地址修改到我们下载的jquery文件地址: <script src= \" {{ SITEURL }} /theme/tipuesearch/jquery.min.js\" ></script> 这样搜索功能就完成了. 五. 上传到Github pages 进入 output 文件夹, 依次执行 git init git add . git remote add origin https : // github . com / your_username / your_username . github . io git pull origin master git commit - m 'first blog' git push origin master 进入 https://your_username.github.io 就能看到你的博客了.","tags":"Pelican","url":"/blog/2019_09_04/create-blog"}]};